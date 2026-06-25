require('dotenv').config();

const CAMERPAY_CONFIG = {
  // API Configuration
  apiKey: process.env.CAMERPAY_API_KEY,
  secretKey: process.env.CAMERPAY_SECRET_KEY,
  webhookSecret: process.env.CAMERPAY_WEBHOOK_SECRET,
  environment: process.env.CAMERPAY_ENV || 'test',

  // API Endpoints
  baseUrl: process.env.CAMERPAY_ENV === 'production'
    ? 'https://api.camerpay.com'
    : 'https://test-api.camerpay.com',

  // Subscription Configuration
  subscriptions: {
    monthly: {
      amount: parseFloat(process.env.SUBSCRIPTION_MONTHLY_AMOUNT) || 2000,
      currency: process.env.CURRENCY_CODE || 'XAF',
      label: 'Abonnement Mensuel',
      durationDays: 30,
    },
    yearly: {
      amount: parseFloat(process.env.SUBSCRIPTION_YEARLY_AMOUNT) || 20000,
      currency: process.env.CURRENCY_CODE || 'XAF',
      label: 'Abonnement Annuel',
      durationDays: 365,
    },
  },

  // Trial Configuration
  trial: {
    durationDays: parseInt(process.env.SUBSCRIPTION_TRIAL_DAYS) || 30,
    enabled: true,
    label: 'Essai Gratuit',
  },

  // Payment Types
  paymentTypes: {
    MISSION: 'mission',
    SUBSCRIPTION: 'subscription',
  },

  // Webhook Configuration
  webhook: {
    events: {
      PAYMENT_SUCCESS: 'payment.success',
      PAYMENT_FAILED: 'payment.failed',
      PAYMENT_PENDING: 'payment.pending',
      PAYMENT_CANCELLED: 'payment.cancelled',
    },
  },

  // Logging
  logLevel: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
};

// Validate required environment variables
function validateConfig() {
  const required = ['CAMERPAY_API_KEY', 'CAMERPAY_SECRET_KEY'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.warn(`⚠️  Missing CamerPay config: ${missing.join(', ')}`);
    console.warn('Please set these variables in your .env file');
  }

  return {
    isValid: missing.length === 0,
    missing,
  };
}

module.exports = {
  CAMERPAY_CONFIG,
  validateConfig,
};
