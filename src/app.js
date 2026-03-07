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

// Webhook NotchPay (POST - pour les notifications serveur)
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

// ✅ Route GET pour le callback NotchPay (redirection après paiement)
app.get('/notchpay/callback', async (req, res) => {
  try {
    const { reference, status, mission_id } = req.query;
    console.log('NotchPay GET callback:', req.query);

    if (status === 'complete' || status === 'success') {
      if (mission_id) {
        await supabase
          .from('missions')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString()
          })
          .eq('id', mission_id);
        console.log(`✅ Mission ${mission_id} payée via GET callback`);
      }
    }

    // Rediriger vers une page de succès
    res.redirect('/payment/success');
  } catch (error) {
    console.error('GET Callback error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Page de succès (affichée après redirection)
app.get('/payment/success', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Paiement réussi - TechLink</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
            text-align: center;
            padding: 40px 20px;
            background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
          }
          .card {
            background: white;
            border-radius: 24px;
            padding: 40px;
            box-shadow: 0 10px 30px rgba(22, 163, 74, 0.15);
            max-width: 500px;
            width: 100%;
          }
          h1 {
            color: #16a34a;
            font-size: 32px;
            margin: 20px 0 10px;
            font-weight: 600;
          }
          p {
            color: #374151;
            font-size: 16px;
            line-height: 1.6;
            margin: 10px 0;
          }
          .icon {
            font-size: 72px;
            margin-bottom: 10px;
          }
          .button {
            background: #16a34a;
            color: white;
            border: none;
            border-radius: 12px;
            padding: 14px 28px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            margin-top: 20px;
            text-decoration: none;
            display: inline-block;
            transition: background 0.2s;
          }
          .button:hover {
            background: #15803d;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✅</div>
          <h1>Paiement réussi !</h1>
          <p>Votre transaction a été effectuée avec succès.</p>
          <p>Vous pouvez retourner sur l'application TechLink pour continuer.</p>
          <a href="https://techlink.app" class="button">Retour à l'application</a>
        </div>
      </body>
    </html>
  `);
});

// Gestion erreurs globale (doit être après toutes les routes)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erreur serveur' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 TechLink API démarrée sur le port ${PORT}`);
});

module.exports = app;