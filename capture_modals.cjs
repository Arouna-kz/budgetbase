const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.APP_URL || 'http://localhost:5175/budgetbase/';
const OUT = path.join(process.cwd(), 'guide_screens');

// [menu, bouton d'ouverture, fichier]
const targets = [
  ['Gestion des Subventions', 'Nouvelle Subvention', '20-form-subvention.png'],
  ['Gestion des Subventions', 'Notifier un montant', '21-notifier-montant.png'],
  ['Planification', 'Nouvelle Ligne', '22-form-ligne.png'],
  ['Engagements', 'Nouvel Engagement', '23-form-engagement.png'],
  ['Paiements', 'Créer Fiche de Paiement', '24-form-paiement.png'],
  ['Trésorerie', 'Ajouter un paiement partiel', '25-paiement-partiel.png'],
  ['Rapprochement', 'Importer un relevé', '26-import-releve.png'],
  ['Utilisateurs', 'Nouvel Utilisateur', '27-form-utilisateur.png'],
  ['Utilisateurs', 'Nouveau Rôle', '28-form-role.png'],
];

async function login(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  const email = page.locator('input[type=email]');
  if (await email.count()) {
    await email.fill('admin@budgetbase.com');
    await page.fill('input[type=password]', 'admin123');
    await page.click('button[type=submit]');
    await page.waitForSelector('input[type=email]', { state: 'detached', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(7000);
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1120 }, deviceScaleFactor: 1.5 });
  const page = await context.newPage();
  page.on('pageerror', e => console.log('PAGEERR', e.message));

  await login(page);
  console.log('Logged in.');

  for (const [menu, btn, file] of targets) {
    try {
      // état propre : reload (re-login si nécessaire, puis attendre la sidebar)
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      const email = page.locator('input[type=email]');
      if (await email.count()) {
        await email.fill('admin@budgetbase.com');
        await page.fill('input[type=password]', 'admin123');
        await page.click('button[type=submit]');
        await page.waitForTimeout(2000);
      }
      await page.waitForSelector('nav button', { timeout: 40000 });
      await page.waitForTimeout(1500);
      await page.locator('nav button', { hasText: menu }).first().click({ timeout: 10000 });
      await page.waitForTimeout(3000);
      const opener = page.locator('button', { hasText: btn }).first();
      await opener.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
      await opener.click({ timeout: 8000 });
      await page.waitForTimeout(2800);
      await page.screenshot({ path: path.join(OUT, file) });
      console.log('OK  ', file);
    } catch (e) {
      console.log('SKIP', file, '::', String(e.message).split('\n')[0]);
    }
  }

  await browser.close();
  console.log('DONE');
})().catch(e => { console.log('FATAL', e.message); process.exit(1); });
