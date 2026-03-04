const aiService = require('./ai.service');

const analyzeProblem = async (req, res) => {
  try {
    const { problem, photos_count } = req.body;

    if (!problem || problem.trim().length < 5) {
      return res.status(400).json({
        error: 'Veuillez décrire votre problème plus en détail'
      });
    }

    const result = await aiService.analyzeProblem(problem, photos_count || 0);
    res.json(result);

  } catch (error) {
    console.error('Erreur analyze problem:', error);
    res.status(500).json({ error: 'Erreur lors de l\'analyse IA' });
  }
};

module.exports = { analyzeProblem };