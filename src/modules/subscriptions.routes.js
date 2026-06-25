const express = require('express');
const SubscriptionController = require('./subscriptionController');

const router = express.Router();

/**
 * POST /api/subscriptions/start-trial
 * Start 1-month free trial for newly registered technician
 */
router.post('/start-trial', async (req, res) => {
  try {
    const { technicianId } = req.body;

    if (!technicianId) {
      return res.status(400).json({
        success: false,
        error: 'Missing technicianId',
      });
    }

    const result = await SubscriptionController.startFreeTrial(technicianId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Start trial error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/subscriptions/initialize
 * Initialize subscription payment (monthly or yearly)
 */
router.post('/initialize', async (req, res) => {
  try {
    const { technicianId, subscriptionType, technicianData } = req.body;

    if (!technicianId || !subscriptionType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: technicianId, subscriptionType',
      });
    }

    if (!technicianData || !technicianData.phone || !technicianData.email || !technicianData.name) {
      return res.status(400).json({
        success: false,
        error: 'Missing technician data: phone, email, name',
      });
    }

    const result = await SubscriptionController.initializeSubscription(
      technicianId,
      subscriptionType,
      technicianData
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Initialize subscription error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/subscriptions/verify/:reference
 * Verify subscription payment and activate it
 */
router.post('/verify/:reference', async (req, res) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({
        success: false,
        error: 'Missing reference',
      });
    }

    const result = await SubscriptionController.verifySubscription(reference);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Verify subscription error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/subscriptions/status/:technicianId
 * Get subscription status for a technician
 */
router.get('/status/:technicianId', async (req, res) => {
  try {
    const { technicianId } = req.params;

    if (!technicianId) {
      return res.status(400).json({
        success: false,
        error: 'Missing technicianId',
      });
    }

    const result = await SubscriptionController.getSubscriptionStatus(technicianId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/subscriptions/renew/:technicianId
 * Renew subscription
 */
router.post('/renew/:technicianId', async (req, res) => {
  try {
    const { technicianId } = req.params;
    const { technicianData } = req.body;

    if (!technicianId || !technicianData) {
      return res.status(400).json({
        success: false,
        error: 'Missing technicianId or technicianData',
      });
    }

    const result = await SubscriptionController.renewSubscription(
      technicianId,
      technicianData
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Renew subscription error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/subscriptions/cancel/:technicianId
 * Cancel subscription
 */
router.post('/cancel/:technicianId', async (req, res) => {
  try {
    const { technicianId } = req.params;

    if (!technicianId) {
      return res.status(400).json({
        success: false,
        error: 'Missing technicianId',
      });
    }

    const result = await SubscriptionController.cancelSubscription(technicianId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
