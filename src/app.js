const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const app = express();

// ✅ Middleware EN PREMIER
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Routes
const aiRoutes = require('./modules/ai/ai.routes');
const missionRoutes = require('./modules/missions/mission.routes');

app.use('/api/ai', aiRoutes);
app.use('/api/missions', missionRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'TechLink API running' });
});

// Webhook NotchPay
app.post('/notchpay/callback', async (req, res) => {
  try {
    const { event, data } = req.body;
    console.log('NotchPay webhook:', event, data);

    if (event === 'payment.complete' || event === 'payment.success') {
      const missionId = data?.transaction?.metadata?.mission_id;
      
      if (missionId) {
        await supabase
          .from('missions')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString()
          })
          .eq('id', missionId);

        console.log(`✅ Mission ${missionId} payée`);
      }
    }

    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erreur serveur' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 TechLink API démarrée sur le port ${PORT}`);
});

module.exports = app;