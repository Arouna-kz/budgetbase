const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.APP_URL || 'http://localhost:5175/budgetbase/';
const OUT = path.join(process.cwd(), 'guide_screens');

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
  await page.waitForSelector('nav button', { timeout: 40000 });
}

async function gotoMenu(page, menu) {
  await page.locator('nav button', { hasText: menu }).first().click({ timeout: 10000 });
  await page.waitForTimeout(2500);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
  const page = await context.newPage();
  page.on('pageerror', e => console.log('PAGEERR', e.message));

  await login(page);
  console.log('Logged in.');

  // 1) Re-capture page Gestion des Subventions (attendre la fin du chargement des permissions)
  try {
    await gotoMenu(page, 'Gestion des Subventions');
    await page.waitForSelector('button:has-text("Nouvelle Subvention")', { timeout: 30000 });
    await page.waitForTimeout(3500);
    // viewport plus "écran" pour cette capture de page
    await page.screenshot({ path: path.join(OUT, '03-subventions.png') });
    console.log('OK  03-subventions.png');
  } catch (e) { console.log('SKIP 03', String(e.message).split('\n')[0]); }

  // 2) Formulaire "Fiche de Paiement" (Créer Fiche de Paiement), en 3 vues (haut/milieu/bas)
  try {
    await gotoMenu(page, 'Paiements');
    await page.waitForTimeout(3000);
    const btn = page.locator('button', { hasText: 'Créer Fiche de Paiement' }).first();
    await btn.scrollIntoViewIfNeeded({ timeout: 6000 }).catch(() => {});
    await btn.click({ timeout: 8000 });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(OUT, '24a-fiche-paiement.png') });
    console.log('OK  24a-fiche-paiement.png');

    await page.mouse.move(800, 550);
    await page.mouse.wheel(0, 820);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT, '24b-fiche-paiement.png') });
    console.log('OK  24b-fiche-paiement.png');

    await page.mouse.wheel(0, 820);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT, '24c-fiche-paiement.png') });
    console.log('OK  24c-fiche-paiement.png');

    await page.mouse.wheel(0, 820);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT, '24d-fiche-paiement.png') });
    console.log('OK  24d-fiche-paiement.png');
  } catch (e) { console.log('SKIP 24', String(e.message).split('\n')[0]); }

  await browser.close();
  console.log('DONE');
})().catch(e => { console.log('FATAL', e.message); process.exit(1); });
