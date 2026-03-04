const analyzeProblem = async (problem, photosCount) => {

  const normalizeText = (text) => {
    return text.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ');
  };

  const problemNormalized = normalizeText(problem);

  const categories = [
    {
      name: 'Plomberie', slug: 'plomberie',
      keywords: /eau|robinet|fuit|tuyau|wc|toilette|evier|douche|chauffe|canalisation|lavabo|baignoire|egout|inondation|fuite|sanitaire|siphon|calcaire|ecoulement|pression|ballon|cumulus|chaudiere|pompe|vanne/,
      urgencyDefault: 'normal',
      temporary_solution: '1. Fermez le robinet d\'arrêt principal sous l\'évier ou au compteur.\n2. Essuyez l\'eau avec des serviettes pour éviter les dégâts.\n3. Placez un seau sous la fuite en attendant le technicien.',
      safety_warning: 'Évitez tout contact avec des prises électriques si de l\'eau est présente.',
      estimated_duration: '1h à 2h',
    },
    {
      name: 'Électricité', slug: 'electricite',
      keywords: /electr|courant|prise|disjonct|cable|lumiere|ampoule|court circuit|fil|interrupteur|tableau|fusible|surtension|branchement|generateur|solaire|alarme|eclairage|phase|neutre/,
      urgencyDefault: 'urgent',
      temporary_solution: '1. Coupez le disjoncteur général immédiatement.\n2. Débranchez tous les appareils de la zone concernée.\n3. N\'essayez pas de réparer vous-même, attendez le technicien.',
      safety_warning: 'DANGER : Ne touchez jamais un câble électrique dénudé. Restez à distance.',
      estimated_duration: '30min à 2h',
    },
    {
      name: 'Climatisation', slug: 'climatisation',
      keywords: /clim|climatiseur|froid|chaud|ventilat|air conditionn|chauffage|pompe chaleur|thermostat|radiateur|convecteur|split|freon|compresseur|filtre air/,
      urgencyDefault: 'normal',
      temporary_solution: '1. Éteignez la climatisation et débranchez-la.\n2. Vérifiez si le filtre est encrassé et nettoyez-le si possible.\n3. Attendez 30 minutes avant de rappeler le technicien.',
      safety_warning: '',
      estimated_duration: '1h à 3h',
    },
    {
      name: 'Informatique', slug: 'informatique',
      keywords: /ordinateur|pc|laptop|internet|reseau|wifi|ecran|virus|lent|logiciel|bug|crash|mot de passe|routeur|modem|disque|clavier|souris|imprimante|telephone|tablette/,
      urgencyDefault: 'low',
      temporary_solution: '1. Redémarrez votre appareil complètement.\n2. Si problème réseau, débranchez et rebranchez votre routeur.\n3. Notez les messages d\'erreur affichés pour le technicien.',
      safety_warning: '',
      estimated_duration: '30min à 1h',
    },
    {
      name: 'Menuiserie', slug: 'menuiserie',
      keywords: /porte|fenetre|serrure|meuble|bois|parquet|placard|escalier|volet|store|etagere|armoire|poignee|charniere|verrou|cle|cadenas/,
      urgencyDefault: 'low',
      temporary_solution: '1. Si la porte ne ferme plus, utilisez une chaise pour bloquer l\'accès.\n2. Ne forcez pas les serrures bloquées.\n3. Notez l\'emplacement exact du problème.',
      safety_warning: '',
      estimated_duration: '1h à 4h',
    },
    {
      name: 'Peinture', slug: 'peinture',
      keywords: /peinture|tache|humidite|moisissure|papier peint|enduit|couleur|decollement|cloques|revetement|platre|peintre/,
      urgencyDefault: 'low',
      temporary_solution: '1. Si humidité, identifiez et stoppez la source d\'eau d\'abord.\n2. Aérez la pièce pour limiter les moisissures.\n3. Ne peignez pas par-dessus une surface humide.',
      safety_warning: '',
      estimated_duration: '2h à 1 jour',
    },
    {
      name: 'Électroménager', slug: 'electromenager',
      keywords: /frigo|refrigerateur|machine|four|lave|congelateur|micro onde|television|tv|aspirateur|cafetiere|mixeur|grille pain|bouilloire|hotte|plaque|gaziniere|cuisiniere/,
      urgencyDefault: 'normal',
      temporary_solution: '1. Débranchez l\'appareil de la prise électrique.\n2. Vérifiez si le disjoncteur dédié n\'a pas sauté.\n3. Notez le modèle et la marque de l\'appareil pour le technicien.',
      safety_warning: '',
      estimated_duration: '1h à 2h',
    },
    {
      name: 'Maçonnerie', slug: 'maconnerie',
      keywords: /beton|carrelage|fissure|dalle|ciment|macon|plancher|fondation|facade|isolation|toiture|tuile|gouttiere|parpaing|brique|pierre|mortier|chape/,
      urgencyDefault: 'normal',
      temporary_solution: '1. Ne touchez pas aux fissures structurelles.\n2. Éloignez-vous si la fissure est large ou s\'agrandit.\n3. Prenez des photos pour montrer l\'évolution au technicien.',
      safety_warning: 'Si la fissure est large, quittez les lieux et appelez les secours.',
      estimated_duration: '2h à plusieurs jours',
    },
    {
      name: 'Service général', slug: 'plomberie',
      keywords: /.*/,
      urgencyDefault: 'normal',
      temporary_solution: '1. Décrivez le problème plus en détail au technicien.\n2. Prenez des photos si possible.\n3. Évitez d\'aggraver la situation en attendant.',
      safety_warning: '',
      estimated_duration: '1h à 3h',
    },
  ];

  const urgencyKeywords = {
    urgent: /urgent|vite|maintenant|feu|flamme|brule|inond|danger|explosion|gaz|fumee|electrocution|effondrement|urgence|panique/,
    low: /depuis longtemps|pas presse|quand vous pouvez|non urgent|plus tard|pas grave|mineur/,
  };

  let selectedCategory = categories[categories.length - 1];
  let maxMatches = 0;

  categories.slice(0, -1).forEach((cat) => {
    const matches = (problemNormalized.match(cat.keywords) || []).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      selectedCategory = cat;
    }
  });

  let urgency = selectedCategory.urgencyDefault;
  let urgency_label = urgency === 'urgent' ? 'Urgent' : urgency === 'low' ? 'Faible' : 'Normal';

  if (problemNormalized.match(urgencyKeywords.urgent)) {
    urgency = 'urgent';
    urgency_label = 'Urgent';
  } else if (problemNormalized.match(urgencyKeywords.low)) {
    urgency = 'low';
    urgency_label = 'Faible';
  }

  const photoNote = photosCount > 0 ? ` ${photosCount} photo(s) fournie(s).` : '';

  return {
    success: true,
    data: {
      category: selectedCategory.name,
      category_slug: selectedCategory.slug,
      urgency,
      urgency_label,
      temporary_solution: selectedCategory.temporary_solution,
      problem_summary: `Problème de ${selectedCategory.name.toLowerCase()} détecté.${photoNote}`,
      estimated_duration: selectedCategory.estimated_duration,
      safety_warning: selectedCategory.safety_warning,
    }
  };
};

module.exports = { analyzeProblem };