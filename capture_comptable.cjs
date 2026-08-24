const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.APP_URL || 'http://localhost:5175/budgetbase/';
const OUT = path.join(process.cwd(), 'guide_screens');
const EMAIL = 'richard.konin@cccciue.ci';
const PASS = 'cepirich@MP1';

async function login(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  const email = page.locator('input[type=email]');
  if (await email.count()) {
    await email.fill(EMAIL);
    await page.fill('input[type=password]', PASS);
    await page.click('button[type=submit]');
    await page.waitForSelector('input[type=email]', { state: 'detached', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(11000);
  }
  await page.waitForSelector('nav button', { timeout: 60000 });
  await page.waitForTimeout(2000);
}

async function gotoMenu(page, menu) {
  await page.locator('nav button', { hasText: menu }).first().click({ timeout: 10000 });
  await page.waitForTimeout(3000);
}

async function scrollTo(page, text) {
  await page.getByText(text, { exact: false }).first().evaluate(el => el.scrollIntoView({ block: 'start' })).catch(() => {});
  await page.waitForTimeout(900);
}

async function closeModal(page) {
  for (const t of ['Fermer', 'Annuler']) {
    const b = page.getByRole('button', { name: t }).first();
    if (await b.count() && await b.isVisible().catch(() => false)) { await b.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(800); return; }
  }
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(600);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
  const page = await context.newPage();
  page.on('pageerror', e => console.log('PAGEERR', e.message));

  await login(page);
  console.log('Logged in as comptable.');
  console.log('User sample:', (await page.locator('body').innerText().catch(() => '')).slice(0, 120).replace(/\n/g, ' | '));

  // ---- Formulaire Fiche de Paiement (avec Signatures visibles pour le comptable) ----
  try {
    await gotoMenu(page, 'Paiements');
    const opener = page.locator('button', { hasText: 'Créer Fiche de Paiement' }).first();
    await opener.scrollIntoViewIfNeeded({ timeout: 6000 }).catch(() => {});
    await opener.click({ timeout: 8000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT, '24a-fiche-paiement.png') });
    console.log('OK  24a (haut)');
    await scrollTo(page, 'Détails du Paiement');
    await page.screenshot({ path: path.join(OUT, '24b-fiche-paiement.png') });
    console.log('OK  24b (détails)');
    await scrollTo(page, 'Informations de Contrôle');
    await page.screenshot({ path: path.join(OUT, '24c-fiche-paiement.png') });
    console.log('OK  24c (contrôle)');
    await scrollTo(page, "Signatures d'Approbation");
    await page.screenshot({ path: path.join(OUT, '24d-fiche-paiement.png') });
    console.log('OK  24d (signatures)');
    await closeModal(page);
  } catch (e) { console.log('SKIP fiche-paiement ::', String(e.message).split('\n')[0]); }

  // ---- Décaissement complet ----
  try {
    await gotoMenu(page, 'Trésorerie');
    const b = page.locator('button', { hasText: 'Décaisser complet' }).first();
    await b.scrollIntoViewIfNeeded({ timeout: 6000 }).catch(() => {});
    await b.click({ timeout: 8000 });
    await page.waitForTimeout(2800);
    await page.screenshot({ path: path.join(OUT, '30-decaissement-complet.png') });
    console.log('OK  30 (décaissement complet)');
    await closeModal(page);
  } catch (e) { console.log('SKIP decaissement-complet ::', String(e.message).split('\n')[0]); }

  // ---- Paiement partiel ----
  try {
    await gotoMenu(page, 'Trésorerie');
    const b = page.locator('button', { hasText: 'Paiement partiel' }).first();
    await b.scrollIntoViewIfNeeded({ timeout: 6000 }).catch(() => {});
    await b.click({ timeout: 8000 });
    await page.waitForTimeout(2800);
    await page.screenshot({ path: path.join(OUT, '31-decaissement-partiel.png') });
    console.log('OK  31 (paiement partiel)');
    await closeModal(page);
  } catch (e) { console.log('SKIP decaissement-partiel ::', String(e.message).split('\n')[0]); }

  await browser.close();
  console.log('DONE');
})().catch(e => { console.log('FATAL', e.message); process.exit(1); });
