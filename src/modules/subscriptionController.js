const { createClient } = require('@supabase/supabase-js');
const camerpayService = require('../utils/camerpay.service');
const { CAMERPAY_CONFIG } = require('../config/camerpay');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

class SubscriptionController {
  /**
   * Helper to resolve technician ID from either UUID or User ID
   */
  static async resolveTechId(idOrUserId) {
    try {
      const { data, error } = await supabase
        .from('technicians')
        .select('id')
        .or(`id.eq.${idOrUserId},user_id.eq.${idOrUserId}`)
        .maybeSingle();
      if (error) {
        console.error('Error resolving tech ID:', error);
      }
      return data?.id || idOrUserId;
    } catch (e) {
      console.error('Exception resolving tech ID:', e);
      return idOrUserId;
    }
  }

  /**
   * Start free trial for newly registered technician
   */
  static async startFreeTrial(technicianId) {
    try {
      const resolvedId = await this.resolveTechId(technicianId);
      const trialDays = CAMERPAY_CONFIG.trial.durationDays;
      const trialStartDate = new Date();
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + trialDays);

      const { data: updated, error } = await supabase
        .from('technicians')
        .update({
          subscription_type: 'trial',
          subscription_status: 'active',
          trial_start_date: trialStartDate.toISOString(),
          trial_end_date: trialEndDate.toISOString(),
          subscription_start_date: trialStartDate.toISOString(),
          subscription_end_date: trialEndDate.toISOString(),
        })
        .eq('id', resolvedId)
        .select()
        .single();

      if (error) {
        console.error('Free trial start error:', error);
        return { success: false, error: error.message };
      }

      await supabase
        .from('technician_subscriptions')
        .insert({
          technician_id: resolvedId,
          subscription_type: 'trial',
          amount_paid: 0,
          period_start: trialStartDate.toISOString(),
          period_end: trialEndDate.toISOString(),
          trial_type: 'free_trial',
          status: 'active',
          payment_reference: `TRIAL_${resolvedId}_${Date.now()}`,
        });

      console.log(`✅ Free trial started for technician ${resolvedId}`);

      return {
        success: true,
        data: {
          trial_start_date: trialStartDate,
          trial_end_date: trialEndDate,
          trial_days_remaining: trialDays,
        },
      };
    } catch (error) {
      console.error('Free trial error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Initialize subscription payment
   */
  static async initializeSubscription(technicianId, subscriptionType, technicianData) {
    try {
      const resolvedId = await this.resolveTechId(technicianId);
      const { phone, email, name } = technicianData;

      if (!['monthly', 'yearly'].includes(subscriptionType)) {
        return { success: false, error: 'Invalid subscription type' };
      }

      const pricing = CAMERPAY_CONFIG.subscriptions[subscriptionType];
      const reference = camerpayService.generateReference('SUB', resolvedId);

      const paymentResult = await camerpayService.initializePayment({
        type: 'subscription',
        amount: pricing.amount,
        description: `${pricing.label} - ${name}`,
        clientId: resolvedId,
        clientPhone: phone,
        clientEmail: email,
        reference,
        subscriptionType,
        successUrl: `${process.env.BACKEND_URL}/camerpay/callback?reference=${reference}`,
        failureUrl: `${process.env.BACKEND_URL}/camerpay/cancel?reference=${reference}`,
      });

      if (!paymentResult.success) {
        return { success: false, error: paymentResult.error };
      }

      const periodStart = new Date();
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + pricing.durationDays);

      const { data: subscription, error: subError } = await supabase
        .from('technician_subscriptions')
        .insert({
          technician_id: resolvedId,
          subscription_type: subscriptionType,
          amount_paid: pricing.amount,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
          status: 'pending',
          payment_reference: reference,
          camerpay_transaction_id: paymentResult.data.transactionId,
        })
        .select()
        .single();

      if (subError) {
        console.error('Subscription record error:', subError);
        return { success: false, error: subError.message };
      }

      return {
        success: true,
        data: {
          paymentUrl: paymentResult.data.paymentUrl,
          subscriptionId: subscription.id,
          reference: reference,
          amount: pricing.amount,
          duration: `${pricing.durationDays} days`,
          subscriptionType,
        },
      };
    } catch (error) {
      console.error('Subscription initialization error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Verify subscription payment
   */
  static async verifySubscription(reference) {
    try {
      const { data: subscription, error: fetchError } = await supabase
        .from('technician_subscriptions')
        .select('*')
        .eq('payment_reference', reference)
        .single();

      if (fetchError || !subscription) {
        return { success: false, error: 'Subscription not found' };
      }

      if (subscription.status === 'active') {
        return {
          success: true,
          data: {
            subscriptionType: subscription.subscription_type,
            status: 'active',
            startDate: subscription.period_start,
            endDate: subscription.period_end,
            amountPaid: subscription.amount_paid,
          },
        };
      }

      const verificationResult = await camerpayService.verifyTransaction(
        subscription.camerpay_transaction_id
      );

      if (!verificationResult.success) {
        return { success: false, error: verificationResult.error };
      }

      const transactionStatus = verificationResult.data.status;
      const isSuccessful = ['success', 'complete', 'paid'].includes(transactionStatus);
      const isPending = ['pending', 'processing'].includes(transactionStatus);

      if (isSuccessful) {
        await supabase
          .from('technician_subscriptions')
          .update({
            status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('id', subscription.id);

        await supabase
          .from('technicians')
          .update({
            subscription_type: subscription.subscription_type,
            subscription_status: 'active',
            subscription_start_date: subscription.period_start,
            subscription_end_date: subscription.period_end,
            subscription_price_paid: subscription.amount_paid,
            subscription_payment_reference: reference,
            trial_end_date: null,
          })
          .eq('id', subscription.technician_id);

        console.log(`✅ Subscription activated for technician ${subscription.technician_id}`);

        return {
          success: true,
          data: {
            subscriptionType: subscription.subscription_type,
            status: 'active',
            startDate: subscription.period_start,
            endDate: subscription.period_end,
            amountPaid: subscription.amount_paid,
          },
        };
      }

      if (isPending) {
        await supabase
          .from('technician_subscriptions')
          .update({
            status: 'pending',
            updated_at: new Date().toISOString(),
          })
          .eq('id', subscription.id);

        return {
          success: true,
          data: {
            subscriptionType: subscription.subscription_type,
            status: 'pending',
            startDate: subscription.period_start,
            endDate: subscription.period_end,
            amountPaid: subscription.amount_paid,
          },
        };
      }

      await supabase
        .from('technician_subscriptions')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscription.id);

      return { success: false, error: 'Payment failed' };
    } catch (error) {
      console.error('Subscription verification error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get subscription status
   */
  static async getSubscriptionStatus(technicianId) {
    try {
      const resolvedId = await this.resolveTechId(technicianId);
      const { data: technician, error } = await supabase
        .from('technicians')
        .select('subscription_type, subscription_status, subscription_end_date, trial_start_date, trial_end_date')
        .eq('id', resolvedId)
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      const now = new Date();
      let status = {
        hasActiveSubscription: false,
        hasActiveTrial: false,
        daysRemaining: 0,
        type: technician.subscription_type,
        eligibleForTrial: !technician.trial_start_date && !technician.trial_end_date,
      };

      if (technician.subscription_type === 'trial' && technician.trial_end_date) {
        const trialEnd = new Date(technician.trial_end_date);
        if (now < trialEnd) {
          status.hasActiveTrial = true;
          status.daysRemaining = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
          return { success: true, data: status };
        }
      }

      if (['monthly', 'yearly'].includes(technician.subscription_type)) {
        if (technician.subscription_status === 'active' && technician.subscription_end_date) {
          const subEnd = new Date(technician.subscription_end_date);
          if (now < subEnd) {
            status.hasActiveSubscription = true;
            status.daysRemaining = Math.ceil((subEnd - now) / (1000 * 60 * 60 * 24));
            return { success: true, data: status };
          }
        }
      }

      return { success: true, data: status };
    } catch (error) {
      console.error('Status check error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Renew subscription
   */
  static async renewSubscription(technicianId, technicianData) {
    try {
      const resolvedId = await this.resolveTechId(technicianId);
      const { data: technician } = await supabase
        .from('technicians')
        .select('subscription_type')
        .eq('id', resolvedId)
        .single();

      const subscriptionType = technician?.subscription_type || 'monthly';

      return await this.initializeSubscription(resolvedId, subscriptionType, technicianData);
    } catch (error) {
      console.error('Renewal error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cancel subscription
   */
  static async cancelSubscription(technicianId) {
    try {
      const resolvedId = await this.resolveTechId(technicianId);
      const now = new Date();

      await supabase
        .from('technicians')
        .update({
          subscription_type: 'none',
          subscription_status: 'cancelled',
          subscription_end_date: now.toISOString(),
        })
        .eq('id', resolvedId);

      await supabase
        .from('technician_subscriptions')
        .update({
          status: 'cancelled',
          cancelled_at: now.toISOString(),
        })
        .eq('technician_id', resolvedId)
        .eq('status', 'active');

      console.log(`✅ Subscription cancelled for technician ${resolvedId}`);

      return { success: true, data: { message: 'Subscription cancelled' } };
    } catch (error) {
      console.error('Cancellation error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check and expire subscriptions
   */
  static async checkAndExpireSubscriptions() {
    try {
      const now = new Date().toISOString();

      const { data: expiredSubs, error } = await supabase
        .from('technician_subscriptions')
        .select('technician_id')
        .eq('status', 'active')
        .lt('period_end', now);

      if (error) throw error;

      if (expiredSubs && expiredSubs.length > 0) {
        await supabase
          .from('technician_subscriptions')
          .update({ status: 'expired' })
          .lt('period_end', now)
          .eq('status', 'active');

        for (const sub of expiredSubs) {
          await supabase
            .from('technicians')
            .update({
              subscription_status: 'expired',
            })
            .eq('id', sub.technician_id);
        }

        console.log(`⏰ ${expiredSubs.length} subscriptions marked as expired`);
      }

      return { success: true, expiredCount: expiredSubs?.length || 0 };
    } catch (error) {
      console.error('Expiration check error:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = SubscriptionController;
