// EDIツールページの表(サービス行とボタン)を詳細抽出
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
  await page.evaluate(() => ybmCommonJs.useService('22', '2'));
  await page.waitForLoadState('domcontentloaded').catch(()=>{});
  await page.waitForTimeout(3500);
  console.log('EDIページURL:', page.url());

  // 表の行を抽出: サービス名 + 概要 + ボタン(text/onclick/href)
  const rows = await page.evaluate(() => {
    const result = [];
    document.querySelectorAll('tr').forEach(tr => {
      const cells = [...tr.querySelectorAll('td,th')].map(td => td.innerText.trim().replace(/\s+/g,' '));
      const btns = [...tr.querySelectorAll('a,button,input')].map(b => ({
        text: (b.innerText || b.value || '').trim().slice(0,20),
        onclick: b.getAttribute('onclick'),
        href: b.getAttribute('href'),
      })).filter(b => b.text);
      if (cells.length) result.push({ cells, btns });
    });
    return result;
  });
  console.log('=== EDIツール 表の中身 ===');
  console.log(JSON.stringify(rows, null, 2));

  await browser.close();
})();
