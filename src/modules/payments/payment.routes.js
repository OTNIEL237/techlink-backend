const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const camerpayService = require('../../utils/camerpay.service');
const { CAMERPAY_CONFIG } = require('../../config/camerpay');

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function findTechnician(technicianId) {
  const byUserId = await supabase
    .from('technicians')
    .select('id, user_id, wallet_balance, total_earnings, total_missions')
    .eq('user_id', technicianId)
    .maybeSingle();

  if (byUserId.data) {
    return byUserId.data;
  }

  const byTechnicianId = await supabase
    .from('technicians')
    .select('id, user_id, wallet_balance, total_earnings, total_missions')
    .eq('id', technicianId)
    .maybeSingle();

  return byTechnicianId.data;
}

/**
 * POST /api/payments/initialize
 * Initialize a mission payment (client pays technician)
 * No commission deducted (100% goes to technician)
 */
router.post('/initialize', async (req, res) => {
  try {
    const {
      missionId,
      amount,
      clientId,
      clientPhone,
      clientEmail,
      description,
    } = req.body;

    if (!missionId || !amount || !clientId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: missionId, amount, clientId',
      });
    }

    const { data: mission, error: missionError } = await supabase
      .from('missions')
      .select('technician_id')
      .eq('id', missionId)
      .single();

    if (missionError || !mission?.technician_id) {
      return res.status(400).json({
        success: false,
        error: 'Mission technician not found',
      });
    }

    // Generate unique reference
    const reference = camerpayService.generateReference('MISSION', missionId);

    // Initialize payment with CamerPay
    const paymentResult = await camerpayService.initializePayment({
      type: 'mission',
      amount: Math.round(amount), // Amount in XAF (no commission)
      description: description || `Mission Payment - ${missionId}`,
      clientId,
      clientPhone,
      clientEmail,
      reference,
      missionId,
      successUrl: `${process.env.BACKEND_URL}/camerpay/callback?reference=${reference}`,
      failureUrl: `${process.env.BACKEND_URL}/camerpay/cancel?reference=${reference}`,
    });

    if (!paymentResult.success) {
      return res.status(400).json({
        success: false,
        error: paymentResult.error,
      });
    }

    // Store payment initiation in database
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        mission_id: missionId,
        client_id: clientId,
        technician_id: mission.technician_id,
        amount: amount,
        technician_amount: amount > 25 ? amount - 25 : amount,
        platform_fee: amount > 25 ? 25 : 0,
        commission_amount: amount > 25 ? 25 : 0,
        commission_percentage: 0,
        method: 'camerpay',
        status: 'pending',
        payout_status: 'pending',
        camerpay_reference: reference,
        camerpay_transaction_id: paymentResult.data.transactionId,
        is_mission_payment: true,
      })
      .select()
      .single();

    if (paymentError) {
      console.error('Database error:', paymentError);
      return res.status(500).json({
        success: false,
        error: 'Failed to record payment',
      });
    }

    res.json({
      success: true,
      data: {
        paymentUrl: paymentResult.data.paymentUrl,
        paymentId: payment.id,
        reference: reference,
        amount: amount,
      },
    });
  } catch (error) {
    console.error('Payment initialization error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/payments/verify/:reference
 * Verify a payment transaction
 */
router.post('/verify/:reference', async (req, res) => {
  try {
    const { reference } = req.params;

    // Get payment record from database
    const { data: payment, error: fetchError } = await supabase
      .from('payments')
      .select('*')
      .eq('camerpay_reference', reference)
      .single();

    if (fetchError || !payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found',
      });
    }

    if (payment.status === 'success') {
      return res.json({
        success: true,
        data: {
          status: 'success',
          payment,
        },
      });
    }

    // Verify with CamerPay
    const verificationResult = await camerpayService.verifyTransaction(
      payment.camerpay_transaction_id
    );

    if (!verificationResult.success) {
      return res.status(400).json({
        success: false,
        error: verificationResult.error,
      });
    }

    const transactionStatus = verificationResult.data.status;
    const isSuccessful = ['success', 'complete', 'paid'].includes(transactionStatus);
    const isPending = ['pending', 'processing'].includes(transactionStatus);
    const nextStatus = isSuccessful ? 'success' : isPending ? 'pending' : 'failed';

    // Update payment status
    const { error: updateError } = await supabase
      .from('payments')
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.id);

    if (updateError) {
      console.error('Update error:', updateError);
    }

    // If successful, update mission status
    if (isSuccessful) {
      await supabase
        .from('missions')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
        })
        .eq('id', payment.mission_id);

      // Create wallet transaction for technician (no deduction)
      const { data: mission } = await supabase
        .from('missions')
        .select('technician_id')
        .eq('id', payment.mission_id)
        .single();

      if (mission) {
        const technician = await findTechnician(mission.technician_id);
        const walletTechnicianId = technician?.id || mission.technician_id;

        await supabase
          .from('wallet_transactions')
          .insert({
            technician_id: walletTechnicianId,
            mission_id: payment.mission_id,
            type: 'payment',
            amount: payment.technician_amount,
            description: `Payment for mission ${payment.mission_id}`,
            reference: reference,
          });

        if (technician) {
          const newBalance =
            (technician.wallet_balance || 0) + payment.technician_amount;
          const newEarnings =
            (technician.total_earnings || 0) + payment.technician_amount;
          const newMissionCount = (technician.total_missions || 0) + 1;

          await supabase
            .from('technicians')
            .update({
              wallet_balance: newBalance,
              total_earnings: newEarnings,
              total_missions: newMissionCount,
            })
            .eq('id', technician.id);
        }
      }
    }

    res.json({
      success: true,
      data: {
        status: nextStatus, // Use mapped status ('success'/'pending'/'failed') not raw Campay status
        payment: payment,
      },
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/payments/manual/initialize
 * Initialize a manual direct P2P payment (client to technician)
 */
router.post('/manual/initialize', async (req, res) => {
  try {
    const { missionId, clientId, method, senderPhone, amount } = req.body;

    if (!missionId || !clientId || !method || !senderPhone || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: missionId, clientId, method, senderPhone, amount',
      });
    }

    // Find the mission to get the technician_id
    const { data: mission, error: missionError } = await supabase
      .from('missions')
      .select('technician_id')
      .eq('id', missionId)
      .single();

    if (missionError || !mission?.technician_id) {
      return res.status(400).json({
        success: false,
        error: 'Mission technician not found',
      });
    }

    // Generate unique reference
    const reference = `MANUAL_${method.toUpperCase()}_${missionId}_${Date.now()}`;

    // Store manual payment initiation in the payments table
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        mission_id: missionId,
        client_id: clientId,
        technician_id: mission.technician_id,
        amount: amount,
        technician_amount: amount > 25 ? amount - 25 : amount,
        platform_fee: amount > 25 ? 25 : 0,
        commission_amount: amount > 25 ? 25 : 0,
        commission_percentage: 0,
        method: method, // 'mtn' or 'orange'
        status: 'pending',
        payout_status: 'pending',
        camerpay_reference: reference, // we reuse this column for references
        camerpay_transaction_id: senderPhone, // we reuse this to store client's sender phone number!
        is_mission_payment: true,
      })
      .select()
      .single();

    if (paymentError) {
      console.error('Database manual payment error:', paymentError);
      return res.status(500).json({
        success: false,
        error: 'Failed to record manual payment',
      });
    }

    // Update mission status to 'quote_accepted' if not already done
    const { error: updateMissionError } = await supabase
      .from('missions')
      .update({ status: 'quote_accepted' })
      .eq('id', missionId);

    if (updateMissionError) {
      console.error('Failed to update mission status to quote_accepted:', updateMissionError);
    }

    res.json({
      success: true,
      data: {
        paymentId: payment.id,
        reference: reference,
        amount: amount,
      },
    });
  } catch (error) {
    console.error('Manual payment initialization error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/payments/manual/confirm
 * Confirm a manual payment by technician (technician confirms receipt)
 */
router.post('/manual/confirm', async (req, res) => {
  try {
    const { missionId } = req.body;

    if (!missionId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: missionId',
      });
    }

    // Get pending manual payment for this mission
    const { data: payment, error: fetchError } = await supabase
      .from('payments')
      .select('*')
      .eq('mission_id', missionId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching manual payment:', fetchError);
      return res.status(500).json({
        success: false,
        error: 'Error checking payment status',
      });
    }

    let paymentAmount = 0;
    let paymentRef = `MANUAL_CONFIRMED_${missionId}_${Date.now()}`;
    let technicianId = null;

    if (payment) {
      paymentAmount = payment.technician_amount || payment.amount;
      paymentRef = payment.camerpay_reference;
      technicianId = payment.technician_id;

      // Update payment status in database
      const { error: updateError } = await supabase
        .from('payments')
        .update({
          status: 'success',
          updated_at: new Date().toISOString(),
        })
        .eq('id', payment.id);

      if (updateError) {
        console.error('Update payment error:', updateError);
      }
    } else {
      // Fallback: look up mission and quote directly if no payment was initialized
      const { data: mission } = await supabase
        .from('missions')
        .select('technician_id')
        .eq('id', missionId)
        .single();
      
      const { data: quote } = await supabase
        .from('quotes')
        .select('subtotal')
        .eq('mission_id', missionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (mission) {
        technicianId = mission.technician_id;
        let baseAmount = quote ? quote.subtotal : 0;
        paymentAmount = baseAmount > 25 ? baseAmount - 25 : baseAmount;
      }
    }

    // Update mission status to 'paid'
    const { error: updateMissionError } = await supabase
      .from('missions')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
      })
      .eq('id', missionId);

    if (updateMissionError) {
      console.error('Update mission error:', updateMissionError);
    }

    // Find technician and credit their balance
    if (technicianId) {
      const technician = await findTechnician(technicianId);
      const walletTechnicianId = technician?.id || technicianId;

      // Create wallet transaction
      const { error: txError } = await supabase
        .from('wallet_transactions')
        .insert({
          technician_id: walletTechnicianId,
          mission_id: missionId,
          type: 'payment',
          amount: paymentAmount,
          description: `Direct payment received for mission ${missionId}`,
          reference: paymentRef,
        });

      if (txError) {
        console.error('Failed to insert wallet transaction:', txError);
      }

      if (technician) {
        const newBalance = (technician.wallet_balance || 0) + paymentAmount;
        const newEarnings = (technician.total_earnings || 0) + paymentAmount;
        const newMissionCount = (technician.total_missions || 0) + 1;

        const { error: techUpdateError } = await supabase
          .from('technicians')
          .update({
            wallet_balance: newBalance,
            total_earnings: newEarnings,
            total_missions: newMissionCount,
          })
          .eq('id', technician.id);

        if (techUpdateError) {
          console.error('Failed to update technician stats:', techUpdateError);
        }
      }
    }

    res.json({
      success: true,
      data: {
        status: 'success',
      },
    });
  } catch (error) {
    console.error('Manual payment confirmation error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
