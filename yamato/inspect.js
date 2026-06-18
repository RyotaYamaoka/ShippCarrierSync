// ログインページのフォーム構造を調査するスクリプト
require('dotenv').config();
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Opening login page:', process.env.LOGIN_URL);
  await page.goto(process.env.LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // すべての input 欄を列挙
  const inputs = await page.$$eval('input', els =>
    els.map(e => ({
      name: e.name,
      id: e.id,
      type: e.type,
      placeholder: e.placeholder,
      maxLength: e.maxLength,
    }))
  );
  console.log('=== INPUT FIELDS ===');
  console.log(JSON.stringify(inputs, null, 2));

  // ログインボタン候補（button, input[submit], a）
  const buttons = await page.$$eval('button, input[type=submit], input[type=button], a', els =>
    els.slice(0, 40).map(e => ({
      tag: e.tagName,
      type: e.type,
      text: (e.value || e.innerText || '').trim().slice(0, 30),
      id: e.id,
      name: e.name,
    })).filter(e => e.text)
  );
  console.log('=== BUTTONS / LINKS (login candidates) ===');
  console.log(JSON.stringify(buttons, null, 2));

  await page.screenshot({ path: 'step0-loginpage.png', fullPage: true });
  console.log('Screenshot saved: step0-loginpage.png');

  console.log('\n>>> 調査完了。ブラウザは10秒後に閉じます。');
  await page.waitForTimeout(10000);
  await browser.close();
})();
