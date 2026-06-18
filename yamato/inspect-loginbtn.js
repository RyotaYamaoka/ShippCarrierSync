// ログインボタンの onclick / 所属フォームを調査
require('dotenv').config();
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto(process.env.LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // 「ログイン」というテキストを持つ a/button の詳細
  const details = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('a, button, input').forEach(e => {
      const t = (e.innerText || e.value || '').trim();
      if (t === 'ログイン' || /ログイン/.test(t) && t.length < 8) {
        out.push({
          tag: e.tagName,
          text: t,
          onclick: e.getAttribute('onclick'),
          href: e.getAttribute('href'),
          outerHTML: e.outerHTML.slice(0, 300),
        });
      }
    });
    return out;
  });
  console.log('=== ログインボタン詳細 ===');
  console.log(JSON.stringify(details, null, 2));

  // フォーム一覧
  const forms = await page.$$eval('form', els =>
    els.map(f => ({ name: f.name, id: f.id, action: f.action, method: f.method }))
  );
  console.log('=== FORMS ===');
  console.log(JSON.stringify(forms, null, 2));

  await browser.close();
})();
