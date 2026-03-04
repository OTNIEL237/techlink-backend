const missionService = require('./mission.service');

const createMission = async (req, res) => {
  try {
    const mission = await missionService.createMission(req.body);
    res.json({ success: true, data: mission });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

const getClientMissions = async (req, res) => {
  try {
    const missions = await missionService.getClientMissions(req.params.clientId);
    res.json({ success: true, data: missions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

const getMissionById = async (req, res) => {
  try {
    const mission = await missionService.getMissionById(req.params.missionId);
    res.json({ success: true, data: mission });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

const updateMissionStatus = async (req, res) => {
  try {
    const mission = await missionService.updateMissionStatus(
      req.params.missionId, req.body.status);
    res.json({ success: true, data: mission });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

module.exports = { createMission, getClientMissions, getMissionById, updateMissionStatus };