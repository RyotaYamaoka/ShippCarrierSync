// ログイン → EDIツール → 「マスタパックダウンロード」の利用する → 遷移先を確認
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

  console.log('[2] EDIツールへ');
  await page.evaluate(() => ybmCommonJs.useService('22', '2'));
  await page.waitForLoadState('domcontentloaded').catch(()=>{});
  await page.waitForTimeout(3000);

  console.log('[3] 「マスタパックダウンロード」の利用する をクリック');
  const popupPromise = context.waitForEvent('page', { timeout: 10000 }).catch(() => null);
  await page.evaluate(() =>
    useServiceSV0301(new Event('click'), '01',
      'https://ybmsubsys.kuronekoyamato.co.jp/ybmsubsys/RelationStart?func=14', '1', '0', '22')
  );
  const popup = await popupPromise;

  let target = page;
  if (popup) { console.log('    → 新しいタブで開いた'); await popup.waitForLoadState('domcontentloaded').catch(()=>{}); target = popup; }
  else { console.log('    → 同じタブで遷移'); await page.waitForLoadState('domcontentloaded').catch(()=>{}); }
  await target.waitForTimeout(4000);

  console.log('[4] 遷移先URL:', target.url());
  console.log('    タイトル:', await target.title().catch(()=>''));
  await target.screenshot({ path: 'step3-masterpack.png', fullPage: true });
  console.log('    スクショ保存: step3-masterpack.png');

  // 遷移先の操作要素を抽出
  const els = await target.evaluate(() => {
    const out = { links: [], buttons: [], selects: [], checkboxes: [] };
    document.querySelectorAll('a').forEach(e => { const t=(e.innerText||'').trim(); if(t) out.links.push({text:t.slice(0,40), onclick:e.getAttribute('onclick'), href:e.getAttribute('href')}); });
    document.querySelectorAll('button, input[type=button], input[type=submit]').forEach(e => { const t=(e.innerText||e.value||'').trim(); if(t) out.buttons.push({text:t.slice(0,40), onclick:e.getAttribute('onclick'), name:e.name}); });
    document.querySelectorAll('select').forEach(e => out.selects.push({name:e.name, options:[...e.options].map(o=>o.text).slice(0,20)}));
    document.querySelectorAll('input[type=checkbox], input[type=radio]').forEach(e => out.checkboxes.push({type:e.type, name:e.name, value:e.value}));
    return out;
  }).catch(()=>({}));
  console.log('=== 遷移先の操作要素 ===');
  console.log(JSON.stringify(els, null, 2));

  console.log('\n>>> ブラウザは30秒開いたままにします。画面を確認してください。');
  await target.waitForTimeout(30000);
  await browser.close();
})();
