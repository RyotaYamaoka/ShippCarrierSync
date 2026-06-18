// ヤマトビジネスメンバーズ: ログイン → 左メニューのリンク一覧を取得
require('dotenv').config();
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  // JSのalert/confirm（エラーメッセージ）を拾う
  page.on('dialog', async (dialog) => {
    console.log(`[DIALOG] ${dialog.type()}: ${dialog.message()}`);
    await dialog.accept().catch(() => {});
  });

  console.log('[1] ログインページを開く');
  await page.goto(process.env.LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  console.log('[2] 認証情報を入力');
  await page.fill('#code1', process.env.LOGIN_ID);
  await page.fill('#password', process.env.LOGIN_PASSWORD);
  if (process.env.PERSONAL_ID) {
    await page.fill('#kojin', process.env.PERSONAL_ID);
  }

  console.log('[3] ログイン関数を実行 func_request_Link(LOGIN)');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
    page.evaluate(() => func_request_Link('LOGIN')),
  ]);
  await page.waitForTimeout(3000);

  console.log('[4] ログイン後のURL:', page.url());
  await page.screenshot({ path: 'step1-after-login.png', fullPage: true });
  console.log('    スクショ保存: step1-after-login.png');

  // ページ内の全リンクを列挙（EDIツールを探す）
  const links = await page.$$eval('a', els =>
    els.map(e => ({
      text: (e.innerText || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      href: e.href,
    })).filter(e => e.text)
  );
  console.log('=== ページ内リンク一覧 ===');
  // EDIを含むものを優先表示
  const ediLinks = links.filter(l => /EDI/i.test(l.text) || /EDI/i.test(l.href));
  console.log('--- "EDI"を含むリンク ---');
  console.log(JSON.stringify(ediLinks, null, 2));
  console.log('--- 全リンク（最初の60件）---');
  console.log(JSON.stringify(links.slice(0, 60), null, 2));

  console.log('\n>>> ブラウザは20秒開いたままにします。画面を確認してください。');
  await page.waitForTimeout(20000);
  await browser.close();
})();
