const express = require('express');
const router = express.Router();
const adminController = require('./admin.controller');

// Résolution de litige
router.post('/disputes/:id/resolve', adminController.resolveDispute);

module.exports = router;
