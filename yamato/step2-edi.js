// ログイン → 左メニュー「EDIツール」をクリック → 開いた画面を確認
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

  console.log('[1] ログイン');
  await login(page);
  console.log('    OK:', page.url().includes('LOGGEDIN') ? 'ログイン成功' : '要確認');

  console.log('[2] 左メニュー「EDIツール」をクリック (useService 22,2)');
  // 新しいタブ(popup)が開くか、同タブ遷移か両対応
  const popupPromise = context.waitForEvent('page', { timeout: 8000 }).catch(() => null);
  await page.evaluate(() => ybmCommonJs.useService('22', '2'));
  const popup = await popupPromise;

  let target = page;
  if (popup) {
    console.log('    → 新しいタブが開きました');
    await popup.waitForLoadState('domcontentloaded').catch(()=>{});
    target = popup;
  } else {
    console.log('    → 同じタブで遷移');
    await page.waitForLoadState('domcontentloaded').catch(()=>{});
  }
  await target.waitForTimeout(4000);

  console.log('[3] 遷移先URL:', target.url());
  console.log('    タイトル:', await target.title().catch(()=>''));
  await target.screenshot({ path: 'step2-edi.png', fullPage: true });
  console.log('    スクショ保存: step2-edi.png');

  // 遷移先のメニュー/リンクを列挙
  const links = await target.$$eval('a, button', els =>
    els.map(e => (e.innerText || e.value || '').trim().replace(/\s+/g,' ').slice(0,40))
       .filter(Boolean)
  ).catch(()=>[]);
  console.log('=== 遷移先のリンク/ボタン（先頭50件）===');
  console.log(JSON.stringify([...new Set(links)].slice(0, 50), null, 2));

  console.log('\n>>> ブラウザは25秒開いたままにします。画面を確認してください。');
  await target.waitForTimeout(25000);
  await browser.close();
})();
