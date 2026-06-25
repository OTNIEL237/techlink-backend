const fs = require('fs');
const path = require('path');

const targetDir = 'c:\\Users\\Lenovo\\techlink-app\\backend\\src\\modules\\subscriptions';
const controllerPath = path.join(targetDir, 'subscription.controller.js');

const controllerContent = `const { createClient } = require('@supabase/supabase-js');
const camerpayService = require('../../utils/camerpay.service');
const { CAMERPAY_CONFIG } = require('../../config/camerpay');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

class SubscriptionController {
  static async startFreeTrial(technicianId) {
    try {
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
        .eq('id', technicianId)
        .select()
        .single();

      if (error) {
        console.error('Free trial start error:', error);
        return { success: false, error: error.message };
      }

      await supabase
        .from('technician_subscriptions')
        .insert({
          technician_id: technicianId,
          subscription_type: 'trial',
          amount_paid: 0,
          period_start: trialStartDate.toISOString(),
          period_end: trialEndDate.toISOString(),
          trial_type: 'free_trial',
          status: 'active',
          payment_reference: \`TRIAL_\${technicianId}_\${Date.now()}\`,
        });

      console.log(\`✅ Free trial started for technician \${technicianId}\`);

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

  static async initializeSubscription(technicianId, subscriptionType, technicianData) {
    try {
      const { phone, email, name } = technicianData;

      if (!['monthly', 'yearly'].includes(subscriptionType)) {
        return { success: false, error: 'Invalid subscription type' };
      }

      const pricing = CAMERPAY_CONFIG.subscriptions[subscriptionType];
      const reference = camerpayService.generateReference('SUB', technicianId);

      const paymentResult = await camerpayService.initializePayment({
        type: 'subscription',
        amount: pricing.amount,
        description: \`\${pricing.label} - \${name}\`,
        clientId: technicianId,
        clientPhone: phone,
        clientEmail: email,
        reference,
        subscriptionType,
        successUrl: \`\${process.env.BACKEND_URL}/camerpay/callback?reference=\${reference}\`,
        failureUrl: \`\${process.env.BACKEND_URL}/camerpay/cancel?reference=\${reference}\`,
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
          technician_id: technicianId,
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
          duration: \`\${pricing.durationDays} days\`,
          subscriptionType,
        },
      };
    } catch (error) {
      console.error('Subscription initialization error:', error);
      return { success: false, error: error.message };
    }
  }

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

      const verificationResult = await camerpayService.verifyTransaction(
        subscription.camerpay_transaction_id
      );

      if (!verificationResult.success) {
        return { success: false, error: verificationResult.error };
      }

      const transactionStatus = verificationResult.data.status;

      if (transactionStatus === 'success') {
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

        console.log(\`✅ Subscription activated for technician \${subscription.technician_id}\`);

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

      return { success: false, error: 'Payment failed' };
    } catch (error) {
      console.error('Subscription verification error:', error);
      return { success: false, error: error.message };
    }
  }

  static async getSubscriptionStatus(technicianId) {
    try {
      const { data: technician, error } = await supabase
        .from('technicians')
        .select('subscription_type, subscription_status, subscription_end_date, trial_end_date')
        .eq('id', technicianId)
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

  static async renewSubscription(technicianId, technicianData) {
    try {
      const { data: technician } = await supabase
        .from('technicians')
        .select('subscription_type')
        .eq('id', technicianId)
        .single();

      const subscriptionType = technician?.subscription_type || 'monthly';

      return await this.initializeSubscription(technicianId, subscriptionType, technicianData);
    } catch (error) {
      console.error('Renewal error:', error);
      return { success: false, error: error.message };
    }
  }

  static async cancelSubscription(technicianId) {
    try {
      const now = new Date();

      await supabase
        .from('technicians')
        .update({
          subscription_type: 'none',
          subscription_status: 'cancelled',
          subscription_end_date: now.toISOString(),
        })
        .eq('id', technicianId);

      await supabase
        .from('technician_subscriptions')
        .update({
          status: 'cancelled',
          cancelled_at: now.toISOString(),
        })
        .eq('technician_id', technicianId)
        .eq('status', 'active');

      console.log(\`✅ Subscription cancelled for technician \${technicianId}\`);

      return { success: true, data: { message: 'Subscription cancelled' } };
    } catch (error) {
      console.error('Cancellation error:', error);
      return { success: false, error: error.message };
    }
  }

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

        console.log(\`⏰ \${expiredSubs.length} subscriptions marked as expired\`);
      }

      return { success: true, expiredCount: expiredSubs?.length || 0 };
    } catch (error) {
      console.error('Expiration check error:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = SubscriptionController;
`;

try {
  // Create directory
  fs.mkdirSync(targetDir, { recursive: true });
  console.log('✅ Directory created:', targetDir);
  
  // Write controller file
  fs.writeFileSync(controllerPath, controllerContent);
  console.log('✅ Controller file created:', controllerPath);
  
} catch (error) {
  console.error('Error:', error.message);
}
