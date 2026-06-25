const assert = require('assert');

// 1. La fonction à tester (Validation d'email)
function validateEmail(email) {
  if (!email) return false;
  // Regex standard pour valider la structure d'un e-mail
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// 2. Les tests unitaires
function runTests() {
  console.log("Démarrage des tests unitaires pour la fonction 'validateEmail'...\n");

  try {
    // Cas de succès (Emails valides attendus à 'true')
    assert.strictEqual(validateEmail('contact@techlink.com'), true, "Erreur: 'contact@techlink.com' devrait être valide");
    assert.strictEqual(validateEmail('jean.dupont@entreprise.fr'), true, "Erreur: 'jean.dupont@entreprise.fr' devrait être valide");
    assert.strictEqual(validateEmail('user123@domain.org'), true, "Erreur: 'user123@domain.org' devrait être valide");
    console.log("✅ Cas valides : OK");

    // Cas d'échec (Emails invalides attendus à 'false')
    assert.strictEqual(validateEmail('contacttechlink.com'), false, "Erreur: Manque de '@' non détecté");
    assert.strictEqual(validateEmail('contact@techlink'), false, "Erreur: Manque de domaine (.com, etc.) non détecté");
    assert.strictEqual(validateEmail('contact@.com'), false, "Erreur: Nom de domaine vide non détecté");
    assert.strictEqual(validateEmail(''), false, "Erreur: Chaîne vide non détectée");
    assert.strictEqual(validateEmail(null), false, "Erreur: Valeur 'null' non détectée");
    console.log("✅ Cas invalides : OK");

    console.log("\n🎉 Tous les tests unitaires ont réussi avec succès !");
  } catch (error) {
    console.error("\n❌ Échec d'un test unitaire :");
    console.error(error.message);
  }
}

runTests();
