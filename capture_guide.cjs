const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.APP_URL || 'http://localhost:5175/budgetbase/';
const OUT = path.join(process.cwd(), 'guide_screens');

const pages = [
  ['Tableau de Bord', '01-tableau-de-bord.png'],
  ['Tableau de suivi budgétaire', '02-suivi-budgetaire.png'],
  ['Gestion des Subventions', '03-subventions.png'],
  ['Planification', '04-planification.png'],
  ['Engagements', '05-engagements.png'],
  ['Paiements', '06-paiements.png'],
  ['Trésorerie', '07-tresorerie.png'],
  ['Rapprochement', '08-rapprochement.png'],
  ['Préfinancements', '09-prefinancements.png'],
  ['Prêts Employés', '10-prets-employes.png'],
  ['Rapports', '11-rapports.png'],
  ['Utilisateurs', '12-utilisateurs.png'],
  ['Configuration', '13-configuration.png'],
  ['Mon Profil', '14-profil.png'],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
  const page = await context.newPage();
  page.on('pageerror', e => console.log('PAGEERR', e.message));

  console.log('GOTO', BASE);
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Écran de connexion
  await page.waitForSelector('input[type=email]', { timeout: 30000 });
  await page.screenshot({ path: path.join(OUT, '00-connexion.png') });

  await page.fill('input[type=email]', 'admin@budgetbase.com');
  await page.fill('input[type=password]', 'admin123');
  await page.click('button[type=submit]');
  console.log('LOGIN submitted');

  // Attendre la sortie de l'écran de connexion (chargement des données)
  await page.waitForSelector('input[type=email]', { state: 'detached', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(8000);
  await page.screenshot({ path: path.join(OUT, '01-tableau-de-bord.png') });
  console.log('Post-login screenshot done. Title text sample:');
  const bodyText = (await page.locator('body').innerText().catch(() => '')).slice(0, 200);
  console.log(bodyText.replace(/\n/g, ' | '));

  for (const [label, file] of pages) {
    try {
      const item = page.locator('nav button', { hasText: label }).first();
      await item.click({ timeout: 8000 });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(OUT, file) });
      console.log('OK  ', label);
    } catch (e) {
      console.log('SKIP', label, '::', String(e.message).split('\n')[0]);
    }
  }

  await browser.close();
  console.log('DONE');
})().catch(e => { console.log('FATAL', e.message); process.exit(1); });
