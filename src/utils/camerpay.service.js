const axios = require('axios');
const crypto = require('crypto');
const { CAMERPAY_CONFIG } = require('../config/camerpay');

class CamerPayService {
  constructor() {
    this.baseUrl = CAMERPAY_CONFIG.baseUrl;
    this.apiKey = CAMERPAY_CONFIG.apiKey;
    this.secretKey = CAMERPAY_CONFIG.secretKey;
    this.webhookSecret = CAMERPAY_CONFIG.webhookSecret;
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });
  }

  async getToken() {
    try {
      const payload = {
        username: this.apiKey,
        password: this.secretKey,
      };
      const response = await axios.post('https://demo.campay.net/api/token/', payload);
      return response.data.token;
    } catch (error) {
      console.error('Campay token error:', error.message);
      throw new Error('Failed to obtain Campay token');
    }
  }

  /**
   * Initialize a payment (mission or subscription)
   * @param {Object} paymentData - Payment details
   * @returns {Promise<Object>} Payment authorization data
   */
  async initializePayment(paymentData) {
    try {
      const {
        type, // 'mission' or 'subscription'
        amount,
        description,
        clientId,
        clientPhone,
        clientEmail,
        reference, // unique transaction reference
        missionId,
        subscriptionType, // 'monthly' or 'yearly' for subscriptions
      } = paymentData;

      const token = await this.getToken();

      // Format phone to Campay standard (must be 237xxxxxxxxx)
      let phone = clientPhone.replace(/\D/g, '');
      if (phone.length === 9) {
        phone = '237' + phone;
      }

      const payload = {
        amount: amount.toString(),
        currency: 'XAF',
        from: phone,
        description: description || 'Paiement TechLink',
        external_reference: reference
      };

      const response = await axios.post('https://demo.campay.net/api/collect/', payload, {
        headers: {
          'Authorization': `Token ${token}`
        }
      });

      // Campay returns { reference, ussd_code, operator }
      if (response.data && response.data.reference) {
        return {
          success: true,
          data: {
            paymentUrl: 'campay-ussd-push', // Special marker for frontend
            transactionId: response.data.reference, // Campay's internal reference
            reference: reference, // Our internal reference
          },
        };
      }

      throw new Error('Payment initialization failed');
    } catch (error) {
      console.error('CamerPay initialization error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Verify a payment transaction
   * @param {string} transactionId - Transaction ID from CamerPay (Campay's reference)
   * @returns {Promise<Object>} Transaction status
   */
  async verifyTransaction(transactionId) {
    try {
      const token = await this.getToken();

      const response = await axios.get(`https://demo.campay.net/api/transaction/${transactionId}/`, {
        headers: {
          'Authorization': `Token ${token}`
        }
      });

      if (response.data) {
        const transaction = response.data;
        // Campay status: "PENDING", "SUCCESSFUL", "FAILED"
        let mappedStatus = 'pending';
        if (transaction.status === 'SUCCESSFUL') mappedStatus = 'success';
        if (transaction.status === 'FAILED') mappedStatus = 'failed';

        return {
          success: true,
          data: {
            status: mappedStatus,
            amount: transaction.amount,
            reference: transaction.external_reference,
            transactionId: transaction.reference,
            metadata: {},
          },
        };
      }

      throw new Error('Transaction verification failed');
    } catch (error) {
      console.error('CamerPay verification error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Validate webhook signature
   * @param {string} signature - Signature from webhook header
   * @param {Object} body - Raw webhook body
   * @returns {boolean} Valid signature
   */
  validateWebhookSignature(signature, body) {
    if (!this.webhookSecret || !signature) {
      return false;
    }

    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const hash = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');

    return hash === signature;
  }

  /**
   * Get subscription details
   * @param {string} subscriptionId - Subscription ID
   * @returns {Promise<Object>} Subscription data
   */
  async getSubscription(subscriptionId) {
    try {
      const response = await this.client.get(`/subscription/${subscriptionId}`, {
        params: {
          apikey: this.apiKey,
        },
      });

      if (response.data && response.data.success) {
        const subscription = response.data.data;
        return {
          success: true,
          data: {
            id: subscription.id,
            status: subscription.status, // 'active', 'cancelled', 'expired'
            amount: subscription.amount,
            nextBillingDate: subscription.next_billing_date,
            endDate: subscription.end_date,
          },
        };
      }

      throw new Error(response.data?.message || 'Subscription retrieval failed');
    } catch (error) {
      console.error('CamerPay subscription error:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Cancel a subscription
   * @param {string} subscriptionId - Subscription ID
   * @returns {Promise<Object>} Cancellation result
   */
  async cancelSubscription(subscriptionId) {
    try {
      const response = await this.client.post(`/subscription/${subscriptionId}/cancel`, {
        apikey: this.apiKey,
      });

      if (response.data && response.data.success) {
        return {
          success: true,
          data: {
            message: 'Subscription cancelled',
            subscriptionId,
          },
        };
      }

      throw new Error(response.data?.message || 'Subscription cancellation failed');
    } catch (error) {
      console.error('CamerPay cancellation error:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Withdraw funds to a mobile money number (Payout)
   * @param {Object} payoutData - Payout details
   * @returns {Promise<Object>} Withdrawal result
   */
  async withdraw(payoutData) {
    try {
      const { amount, phone, description, reference } = payoutData;
      const token = await this.getToken();

      // Format phone to Campay standard (must be 237xxxxxxxxx)
      let formattedPhone = phone.replace(/\D/g, '');
      if (formattedPhone.length === 9) {
        formattedPhone = '237' + formattedPhone;
      }

      const payload = {
        amount: amount.toString(),
        currency: 'XAF',
        to: formattedPhone,
        description: description || 'Paiement Technicien TechLink',
        external_reference: reference
      };

      const response = await axios.post('https://demo.campay.net/api/withdraw/', payload, {
        headers: {
          'Authorization': `Token ${token}`
        }
      });

      if (response.data && response.data.reference) {
        return {
          success: true,
          data: {
            transactionId: response.data.reference,
            status: response.data.status,
          },
        };
      }

      throw new Error('Withdrawal initialization failed');
    } catch (error) {
      console.error('CamerPay withdraw error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Generate transaction reference
   * @param {string} type - 'mission' or 'subscription'
   * @param {string} id - Mission or Subscription ID
   * @returns {string} Unique reference
   */
  generateReference(type, id) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${type.toUpperCase()}_${id}_${timestamp}_${random}`;
  }

  /**
   * Get payment configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    return {
      subscriptions: CAMERPAY_CONFIG.subscriptions,
      trial: CAMERPAY_CONFIG.trial,
      environment: CAMERPAY_CONFIG.environment,
    };
  }
}

module.exports = new CamerPayService();
