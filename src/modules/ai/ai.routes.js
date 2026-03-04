const express = require('express');
const router = express.Router();
const aiController = require('./ai.controller');

router.post('/analyze', aiController.analyzeProblem);

module.exports = router;