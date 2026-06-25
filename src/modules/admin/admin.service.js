const { createClient } = require('@supabase/supabase-js');
const camerpayService = require('../../utils/camerpay.service');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const resolveDispute = async (disputeId, action, adminId, notes) => {
  // 1. Get the dispute
  const { data: dispute, error: disputeError } = await supabase
    .from('disputes')
    .select('*, mission:missions(*)')
    .eq('id', disputeId)
    .single();

  if (disputeError || !dispute) {
    throw new Error('Dispute not found');
  }

  const mission = dispute.mission;

  // 2. Perform the action
  let newMissionStatus = '';
  
  if (action === 'refund_client') {
    // We mark it as cancelled_refunded. Manual refund is needed by admin.
    newMissionStatus = 'cancelled_refunded';
    
  } else if (action === 'force_payment') {
    // 1. Get technician details
    const { data: tech } = await supabase
      .from('technicians')
      .select('mtn_number, orange_number')
      .eq('id', mission.technician_id)
      .single();

    if (!tech) throw new Error('Technician not found');

    const phone = tech.mtn_number || tech.orange_number;
    if (!phone) throw new Error('Technician has no payment number configured');

    // 2. Get quote
    const { data: quote } = await supabase
      .from('quotes')
      .select('subtotal')
      .eq('mission_id', mission.id)
      .eq('status', 'accepted')
      .single();

    if (!quote) throw new Error('No accepted quote found');

    const amount = quote.subtotal;

    // 3. Initiate withdrawal via Camerpay
    const payoutResult = await camerpayService.withdraw({
      amount: amount,
      phone: phone,
      description: `Paiement forcé litige mission ${mission.id}`,
      reference: `force_payout_${disputeId}`
    });

    if (!payoutResult.success) {
      throw new Error(`Payment failed: ${payoutResult.error}`);
    }

    newMissionStatus = 'completed';

  } else if (action === 'neutral_cancel') {
    newMissionStatus = 'cancelled';
  }

  // 3. Update Mission
  await supabase
    .from('missions')
    .update({ status: newMissionStatus })
    .eq('id', mission.id);

  // 4. Update Dispute
  await supabase
    .from('disputes')
    .update({
      status: 'resolved',
      resolution_notes: notes,
      admin_id: adminId,
      updated_at: new Date().toISOString()
    })
    .eq('id', disputeId);

  return { disputeId, newMissionStatus };
};

module.exports = {
  resolveDispute
};
