// ログイン → 「EDIツール」リンクの onclick を調べる + ログイン状態を保存
require('dotenv').config();
const { chromium } = require('playwright');

async function login(page) {
  await page.goto(process.env.LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.fill('#code1', process.env.LOGIN_ID);
  await page.fill('#password', process.env.LOGIN_PASSWORD);
  if (process.env.PERSONAL_ID) await page.fill('#kojin', process.env.PERSONAL_ID);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
    page.evaluate(() => func_request_Link('LOGIN')),
  ]);
  await page.waitForTimeout(2500);
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  page.on('dialog', async d => { console.log('[DIALOG]', d.message()); await d.accept().catch(()=>{}); });

  await login(page);
  console.log('ログイン後URL:', page.url());

  // ログイン状態を保存（次回から使い回せる）
  await context.storageState({ path: 'auth-state.json' });
  console.log('ログイン状態を auth-state.json に保存しました');

  // EDI 関連リンクの詳細
  const edi = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('a').forEach(e => {
      const t = (e.innerText || '').trim();
      if (/EDI/i.test(t)) {
        out.push({ text: t.slice(0,40), onclick: e.getAttribute('onclick'), href: e.getAttribute('href') });
      }
    });
    return out;
  });
  console.log('=== EDI リンク詳細 ===');
  console.log(JSON.stringify(edi, null, 2));

  console.log('\n>>> ブラウザは15秒開いたままにします。');
  await page.waitForTimeout(15000);
  await browser.close();
})();
