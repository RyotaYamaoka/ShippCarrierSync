// 西濃 マイセイノー ログインページのフォーム構造を調査（iframe対応）
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  console.log('Opening:', process.env.LOGIN_URL);
  await page.goto(process.env.LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  console.log('=== フレーム一覧 ===');
  for (const f of page.frames()) {
    console.log(`- frame: name="${f.name()}" url=${f.url()}`);
  }

  // 各フレームの input を列挙
  for (const f of page.frames()) {
    let inputs = [];
    try {
      inputs = await f.$$eval('input', els =>
        els.map(e => ({ name: e.name, id: e.id, type: e.type, placeholder: e.placeholder, maxLength: e.maxLength })));
    } catch {}
    if (inputs.length) {
      console.log(`=== INPUTS in frame ${f.url()} ===`);
      console.log(JSON.stringify(inputs, null, 2));
    }
  }

  // ログイン関連リンク/ボタン（全フレーム）
  for (const f of page.frames()) {
    let els = [];
    try {
      els = await f.$$eval('a, button, input[type=submit], input[type=button]', nodes =>
        nodes.map(e => ({ tag: e.tagName, text: (e.value || e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30), id: e.id, onclick: e.getAttribute('onclick'), href: e.getAttribute('href') }))
             .filter(e => e.text && /ログイン|login|ID/i.test(e.text)));
    } catch {}
    if (els.length) {
      console.log(`=== ログイン候補 in frame ${f.url()} ===`);
      console.log(JSON.stringify(els, null, 2));
    }
  }

  await page.screenshot({ path: path.join(__dirname, 'step0-loginpage.png'), fullPage: true });
  console.log('>>> 15秒後に閉じます');
  await page.waitForTimeout(15000);
  await browser.close();
})();
