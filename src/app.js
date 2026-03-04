const express = require('express');
const cors = require('cors');
require('dotenv').config();

const aiRoutes = require('./modules/ai/ai.routes');

const app = express();

const missionRoutes = require('./modules/missions/mission.routes');
app.use('/api/missions', missionRoutes);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/ai', aiRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'TechLink API running' });
});

// Gestion erreurs globale
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erreur serveur', details: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 TechLink API démarrée sur le port ${PORT}`);
});

module.exports = app;