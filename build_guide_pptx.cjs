const pptxgen = require('pptxgenjs');
const path = require('path');
const fs = require('fs');

const DIR = path.join(process.cwd(), 'guide_screens');
const INDIGO = '4338CA';
const PURPLE = '7C3AED';
const DARK = '1E1B4B';
const LIGHT = 'F5F3FF';
const GREY = '64748B';

const pptx = new pptxgen();
pptx.defineLayout({ name: 'W', width: 13.33, height: 7.5 });
pptx.layout = 'W';
pptx.author = 'Budget Base';
pptx.company = 'Budget Base';
pptx.subject = 'Guide Utilisateur';
pptx.title = 'Guide Utilisateur — Budget Base';

// ---- Slide de titre ----
let s = pptx.addSlide();
s.background = { color: INDIGO };
s.addShape(pptx.ShapeType.rect, { x: 0, y: 4.9, w: 13.33, h: 2.6, fill: { color: DARK } });
s.addText('GUIDE UTILISATEUR', { x: 0.8, y: 2.0, w: 11.7, h: 0.7, fontSize: 20, color: 'C7D2FE', bold: true, charSpacing: 3 });
s.addText('Budget Base', { x: 0.8, y: 2.6, w: 11.7, h: 1.2, fontSize: 54, color: 'FFFFFF', bold: true });
s.addText('Plateforme de gestion budgétaire des subventions', { x: 0.8, y: 3.8, w: 11.7, h: 0.6, fontSize: 20, color: 'E0E7FF' });
s.addText('Prise en main complète de toutes les fonctionnalités  ·  Édition ' + new Date().getFullYear(),
  { x: 0.8, y: 5.3, w: 11.7, h: 0.6, fontSize: 16, color: 'C7D2FE' });

// ---- Sommaire ----
const toc = [
  '1.  Connexion', '2.  Tableau de bord', '3.  Suivi budgétaire', '4.  Gestion des subventions',
  '5.  Planification', '6.  Engagements', '7.  Paiements', '8.  Trésorerie',
  '9.  Rapprochement bancaire', '10. Préfinancements', '11. Prêts employés', '12. Rapports',
  '13. Utilisateurs & rôles', '14. Configuration', '15. Mon profil',
];
s = pptx.addSlide();
s.background = { color: 'FFFFFF' };
s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 1.1, fill: { color: INDIGO } });
s.addText('Sommaire', { x: 0.6, y: 0.15, w: 12, h: 0.8, fontSize: 30, color: 'FFFFFF', bold: true });
const col1 = toc.slice(0, 8).map(t => ({ text: t, options: { breakLine: true } }));
const col2 = toc.slice(8).map(t => ({ text: t, options: { breakLine: true } }));
s.addText(col1, { x: 0.9, y: 1.6, w: 5.8, h: 5.2, fontSize: 18, color: DARK, lineSpacingMultiple: 1.6 });
s.addText(col2, { x: 7.0, y: 1.6, w: 5.8, h: 5.2, fontSize: 18, color: DARK, lineSpacingMultiple: 1.6 });

// ---- Générateur de slide "fonctionnalité" ----
let pageNo = 0;
function feature(num, title, subtitle, image, bullets) {
  pageNo++;
  const sl = pptx.addSlide();
  sl.background = { color: 'FFFFFF' };
  // bandeau titre
  sl.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 1.0, fill: { color: INDIGO } });
  sl.addShape(pptx.ShapeType.rect, { x: 0, y: 1.0, w: 13.33, h: 0.06, fill: { color: PURPLE } });
  sl.addText(`${num}`, { x: 0.35, y: 0.12, w: 0.9, h: 0.76, fontSize: 30, color: 'C7D2FE', bold: true, align: 'center' });
  sl.addText(title, { x: 1.3, y: 0.1, w: 11.7, h: 0.5, fontSize: 24, color: 'FFFFFF', bold: true });
  sl.addText(subtitle, { x: 1.3, y: 0.56, w: 11.7, h: 0.4, fontSize: 13, color: 'E0E7FF' });

  // image (cadre)
  const imgX = 0.35, imgY = 1.35, imgW = 8.55, imgH = imgW / 1.6;
  sl.addShape(pptx.ShapeType.roundRect, { x: imgX - 0.06, y: imgY - 0.06, w: imgW + 0.12, h: imgH + 0.12, fill: { color: 'FFFFFF' }, line: { color: 'CBD5E1', width: 1 }, rectRadius: 0.05 });
  const p = path.join(DIR, image);
  if (fs.existsSync(p)) sl.addImage({ path: p, x: imgX, y: imgY, w: imgW, h: imgH });

  // panneau description
  const panX = 9.15, panW = 3.85;
  sl.addShape(pptx.ShapeType.roundRect, { x: panX, y: imgY - 0.06, w: panW, h: imgH + 0.12, fill: { color: LIGHT }, line: { color: 'DDD6FE', width: 1 }, rectRadius: 0.06 });
  sl.addText('À RETENIR', { x: panX + 0.25, y: imgY + 0.15, w: panW - 0.5, h: 0.35, fontSize: 12, color: PURPLE, bold: true, charSpacing: 2 });
  const items = bullets.map(b => ({ text: b, options: { bullet: { code: '2022' }, color: DARK, breakLine: true } }));
  sl.addText(items, { x: panX + 0.25, y: imgY + 0.6, w: panW - 0.5, h: imgH - 0.8, fontSize: 12.5, lineSpacingMultiple: 1.15, valign: 'top' });

  // pied de page
  sl.addText('Budget Base — Guide utilisateur', { x: 0.35, y: 7.05, w: 8, h: 0.35, fontSize: 10, color: GREY });
  sl.addText(`${pageNo}`, { x: 12.4, y: 7.05, w: 0.6, h: 0.35, fontSize: 10, color: GREY, align: 'right' });
}

feature('1', 'Connexion', 'Accès sécurisé à la plateforme', '00-connexion.png', [
  'Saisissez votre e-mail et votre mot de passe, puis « Se connecter ».',
  'Chaque compte a un rôle (ex. Administrateur, Comptable) qui détermine les menus visibles.',
  'La sécurité est gérée par authentification ; en cas d’oubli, contactez un administrateur.',
]);

feature('2', 'Tableau de bord', 'Vue d’ensemble de la subvention en cours', '01-tableau-de-bord.png', [
  'Indicateurs clés : budget total notifié, taux d’engagement, taux d’exécution, disponible.',
  'Cartes cliquables qui renvoient directement vers la page concernée.',
  'Répartition par ligne budgétaire et liste des subventions actives.',
  'Tout se rapporte à la « Subvention en cours » affichée en haut.',
]);

feature('3', 'Suivi budgétaire', 'Exécution par ligne et sous-ligne', '02-suivi-budgetaire.png', [
  'Tableau hiérarchique : chaque ligne cumule ses sous-lignes (bouton pour déplier/replier).',
  'Colonnes : Notifié, Engagé, Décaissé, P. En Attentes, P. à Créer, P. Rejetés, Disponible, taux.',
  'Tri périodique (Du → Au) pour filtrer les mouvements sur une plage de dates.',
  'Exports PDF et Excel colorés, fidèles au tableau.',
]);

feature('4', 'Gestion des subventions', 'Créer, notifier et suivre les subventions', '03-subventions.png', [
  'Créez/modifiez une subvention ; à la création le montant notifié est à 0.',
  '« Notifier un montant » répartit le budget sur les lignes/sous-lignes sans écraser l’existant.',
  'Cartes : Planifié, Notifié, Engagé, Décaissé, Non engagé, Paiements rejetés.',
  'Consultez le détail (œil) et exportez les fiches en PDF.',
]);

feature('5', 'Planification', 'Lignes et sous-lignes budgétaires', '04-planification.png', [
  'Structurez le budget en lignes puis sous-lignes (montant planifié et notifié).',
  'Taux de notification et repérage des lignes sous-notifiées.',
  'Boutons « Tout développer / Tout réduire » et couleurs distinctes ligne/sous-ligne.',
  'Budget planifié/notifié calculés automatiquement pour les lignes.',
]);

feature('6', 'Engagements', 'Réservation des dépenses par ligne', '05-engagements.png', [
  'Créez un engagement rattaché à une sous-ligne et un fournisseur.',
  'Circuit de signatures et détection des doublons (facture, fournisseur+montant).',
  'Case « Mission » pour marquer et filtrer les engagements de mission.',
  'Exports PDF/Excel + « Export comptable » regroupé par rubrique (ligne budgétaire).',
]);

feature('7', 'Paiements', 'Fiches de paiement et décaissements', '06-paiements.png', [
  'Créez la fiche de paiement d’un engagement ; option « échelonné » dès le départ.',
  'Circuit de signatures, unicité du n° de facture, suivi de la progression.',
  'Cartes récap (montant total, approuvé, rejeté, en attente).',
  'Exports PDF/Excel + « Export comptable » par rubrique.',
]);

feature('8', 'Trésorerie', 'Décaissements et compte bancaire', '07-tresorerie.png', [
  'Décaissez un paiement (complet ou échelonné) ; le mode espèces exclut le rapprochement.',
  'Suivi du compte bancaire de la subvention et de ses transactions.',
  'Filtre périodique (Du → Au) des transactions.',
  'Case « attend un rapprochement » selon le mode de règlement.',
]);

feature('9', 'Rapprochement bancaire', 'Pointer les décaissements avec le relevé', '08-rapprochement.png', [
  'Liste des versements bancaires à pointer (rapprochés / non rapprochés).',
  'Saisie manuelle (bouton « Rapprocher ») ou « Importer un relevé » (assisté).',
  'Filtres statut + période, icône « détail » (œil), export Excel.',
  'Badge du menu = nombre de versements non rapprochés (visible par le comptable).',
]);

feature('10', 'Préfinancements', 'Avances et remboursements', '09-prefinancements.png', [
  'Enregistrez les préfinancements de la subvention.',
  'Suivi des remboursements et du reste à rembourser.',
  'Circuit de validation et export dédié.',
]);

feature('11', 'Prêts employés', 'Prêts et échéanciers de remboursement', '10-prets-employes.png', [
  'Créez des prêts au personnel avec échéancier.',
  'Suivi des remboursements et du solde restant.',
  'Export de la liste et des fiches.',
]);

feature('12', 'Rapports', 'États et exports analytiques', '11-rapports.png', [
  'Générez des rapports par type (dont fournisseurs).',
  'Filtre Mission / hors-mission / tout, avec export groupé ou missions à part.',
  'Téléchargements PDF et Excel.',
]);

feature('13', 'Utilisateurs & rôles', 'Comptes et permissions par module', '12-utilisateurs.png', [
  'Gérez les utilisateurs et leurs rôles.',
  'Chaque rôle reçoit des permissions par module (voir, créer, modifier, exporter…).',
  'Ex. : accorder « Rapprochement » (voir/modifier/exporter) au Comptable.',
]);

feature('14', 'Configuration', 'Subvention en cours pour l’équipe', '13-configuration.png', [
  'Définit la « Subvention en cours » utilisée par toute la plateforme.',
  'Toutes les pages affichent et calculent les données de cette subvention.',
]);

feature('15', 'Mon profil', 'Informations personnelles', '14-profil.png', [
  'Consultez et mettez à jour vos informations de profil.',
  'Le rôle et les permissions sont gérés par un administrateur.',
]);

// ---- Séparateur : Partie 2 ----
s = pptx.addSlide();
s.background = { color: PURPLE };
s.addText('PARTIE 2', { x: 0.8, y: 2.4, w: 11.7, h: 0.6, fontSize: 20, color: 'E9D5FF', bold: true, charSpacing: 3 });
s.addText('Zoom sur les principaux formulaires', { x: 0.8, y: 3.0, w: 11.7, h: 1.0, fontSize: 36, color: 'FFFFFF', bold: true });
s.addText('Détail des écrans de saisie les plus utilisés', { x: 0.8, y: 4.1, w: 11.7, h: 0.6, fontSize: 18, color: 'F3E8FF' });

feature('▸', 'Créer une subvention', 'Menu Subventions → « Nouvelle Subvention »', '20-form-subvention.png', [
  'Renseignez nom, organisme, référence, année, devise et dates.',
  'À la création, le montant notifié est à 0 et le statut « en attente ».',
  'Le montant sera notifié ensuite via « Notifier un montant ».',
]);

feature('▸', 'Notifier un montant', 'Carte d’une subvention → « Notifier un montant »', '21-notifier-montant.png', [
  'Ajoutez un nouveau montant notifié ou modifiez le total existant.',
  'Le montant est réparti automatiquement au prorata du planifié.',
  'Le 1er montant notifié active la subvention.',
  'Bouton grisé tant qu’aucune ligne/sous-ligne n’existe.',
]);

feature('▸', 'Ajouter une ligne budgétaire', 'Menu Planification → « Nouvelle Ligne »', '22-form-ligne.png', [
  'Créez une ligne (code, nom) rattachée à la subvention.',
  'À la création, budget planifié et notifié sont à 0 (calculés ensuite).',
  'Ajoutez ensuite des sous-lignes à l’intérieur de la ligne.',
]);

feature('▸', 'Créer un engagement', 'Menu Engagements → « Nouvel Engagement »', '23-form-engagement.png', [
  'Choisissez ligne, sous-ligne, fournisseur (existant ou nouveau).',
  'Cochez « Cet engagement concerne une mission » si nécessaire.',
  'Le N° de facture est obligatoire ; les doublons sont détectés.',
  'Le solde disponible de la sous-ligne est affiché en direct.',
]);

feature('▸', 'Créer une fiche de paiement — Engagement & trésorerie', 'Menu Paiements → « Créer Fiche de Paiement » (1/4)', '24a-fiche-paiement.png', [
  'Rappel de l’engagement : ligne, sous-ligne, fournisseur, montant engagé.',
  'Analyse de trésorerie : solde bancaire, disponible, impact du paiement.',
  'Début des détails : n° de paiement, date, montant, mode.',
]);

feature('▸', 'Créer une fiche de paiement — Détails du règlement', 'Détails du paiement (2/4)', '24b-fiche-paiement.png', [
  'Choisissez le mode de paiement (chèque, virement, espèces).',
  'Case « Paiement échelonné » : le règlement se fera en plusieurs versements (mode saisi à chaque versement).',
  'N° de chèque / référence de virement et description.',
]);

feature('▸', 'Créer une fiche de paiement — Informations de contrôle', 'Contrôle (3/4)', '24c-fiche-paiement.png', [
  'N° et montant de la facture, référence de devis.',
  'N° de bon de livraison / bon de commande.',
  'Case « Service livré et accepté » et notes de contrôle.',
]);

feature('▸', 'Créer une fiche de paiement — Signatures', 'Signatures d’approbation (4/4)', '24d-fiche-paiement.png', [
  'Coordinateur & Comptable : peuvent signer dès la création.',
  'Coordonnateur National : ne peut signer qu’après la création du paiement.',
  'Les noms ne sont enregistrés que si la signature est validée.',
  'Terminez par « Enregistrer le Paiement ».',
]);

feature('▸', 'Décaissement complet', 'Menu Trésorerie → « Décaisser complet »', '30-decaissement-complet.png', [
  'Rappel : montant total, déjà payé, montant à décaisser, mode d’origine.',
  'Saisissez la date, la référence (n° de chèque / réf. virement) et une description.',
  'Case « Ce décaissement attend un rapprochement bancaire » (décochée d’office pour les espèces).',
  'Validez par « Décaisser complètement ».',
]);

feature('▸', 'Paiement partiel (échelonné)', 'Menu Trésorerie → « Paiement partiel »', '31-decaissement-partiel.png', [
  'Décaissez le paiement en plusieurs versements.',
  'Pour chaque versement : montant, date, mode de règlement et référence.',
  'Case « attend un rapprochement bancaire » selon le mode.',
  'Chaque versement s’ajoute à l’historique et met à jour la progression.',
]);

feature('▸', 'Importer un relevé bancaire', 'Menu Rapprochement → « Importer un relevé »', '26-import-releve.png', [
  'Chargez le relevé brut (.xlsx/.xls/.csv).',
  'Associez les colonnes Date / Montant / Référence.',
  'L’app propose les correspondances (Fiable / À vérifier) ; vous validez.',
  'La saisie manuelle « Rapprocher » reste disponible en parallèle.',
]);

feature('▸', 'Créer un utilisateur', 'Menu Utilisateurs → « Nouvel Utilisateur »', '27-form-utilisateur.png', [
  'Renseignez identité, e-mail et rôle de l’utilisateur.',
  'Le rôle détermine les menus et actions accessibles.',
]);

feature('▸', 'Rôles & permissions', 'Menu Utilisateurs → « Nouveau Rôle »', '28-form-role.png', [
  'Chaque rôle reçoit des permissions par module : voir, créer, modifier, exporter…',
  'Cochez « Rapprochement » (voir/modifier/exporter) pour donner accès au module.',
  'Adaptez finement les droits selon les responsabilités.',
]);

// ---- Slide de fin ----
s = pptx.addSlide();
s.background = { color: INDIGO };
s.addText('Merci', { x: 0.8, y: 2.6, w: 11.7, h: 1.2, fontSize: 48, color: 'FFFFFF', bold: true });
s.addText('Pour toute question, rapprochez-vous de l’administrateur de la plateforme.', { x: 0.8, y: 3.9, w: 11.7, h: 0.6, fontSize: 18, color: 'E0E7FF' });
s.addText('Budget Base — Plateforme de gestion budgétaire', { x: 0.8, y: 6.6, w: 11.7, h: 0.5, fontSize: 14, color: 'C7D2FE' });

pptx.writeFile({ fileName: 'Guide_Utilisateur_BudgetBase-v3.pptx' }).then(f => {
  console.log('PPTX_OK', f);
}).catch(e => { console.log('PPTX_ERR', e.message); process.exit(1); });
