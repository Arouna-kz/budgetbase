const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext({ viewport:{width:1600,height:1000} })).newPage();
  p.on('console', m => { if (m.type()==='error') console.log('CONSOLE', m.text().slice(0,150)); });
  await p.goto('http://localhost:5175/budgetbase/', { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(3000);
  await p.fill('input[type=email]', 'richard.konin@cccciue.ci');
  await p.fill('input[type=password]', 'cepirich@MP1');
  await p.click('button[type=submit]');
  await p.waitForTimeout(9000);
  console.log('BODY:', (await p.locator('body').innerText().catch(()=> '')).slice(0,300).replace(/\n/g,' | '));
  console.log('emailInputs:', await p.locator('input[type=email]').count(), 'navButtons:', await p.locator('nav button').count());
  await p.screenshot({ path:'guide_screens/_debug_comptable.png' });
  await b.close();
})();
