const express = require('express');
const router = express.Router();
const missionController = require('./mission.controller');

router.post('/create', missionController.createMission);
router.get('/client/:clientId', missionController.getClientMissions);
router.get('/:missionId', missionController.getMissionById);
router.patch('/:missionId/status', missionController.updateMissionStatus);

module.exports = router;