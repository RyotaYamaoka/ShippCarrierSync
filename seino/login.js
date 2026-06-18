// 西濃 マイセイノー: ログイン（ID/PW → 必要ならシリアル(KEYNO)セットアップ） → メニュー調査
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { chromium } = require('playwright');

// loginFRAME 内の画像submitのうち value="ログイン" を押す
async function clickLoginImage(frame) {
  await frame.evaluate(() => {
    const imgs = [...document.querySelectorAll('input[type=image]')];
    const btn = imgs.find(i => (i.value || i.alt || '').includes('ログイン')) || imgs[0];
    btn.click();
  });
}

async function seinoLogin(page) {
  await page.goto(process.env.LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  // [1] ID/パスワード
  let frame = page.frame({ name: 'loginFRAME' });
  if (!frame) throw new Error('loginFRAME が見つかりません');
  await frame.fill('input[name="loginid"]', process.env.LOGIN_ID);
  await frame.fill('input[name="passwd"]', process.env.LOGIN_PASSWORD);
  await Promise.all([page.waitForLoadState('networkidle').catch(() => {}), clickLoginImage(frame)]);
  await page.waitForTimeout(3500);

  // [2] シリアル(KEYNO)セットアップ画面が出たら入力（未登録デバイス時のみ）
  frame = page.frame({ name: 'loginFRAME' }) || frame;
  const keyno = await frame.$('input[name="KEYNO"]').catch(() => null);
  if (keyno) {
    if (!process.env.SERIAL_NO) throw new Error('シリアル入力が要求されましたが SERIAL_NO が未設定です');
    console.log('    シリアル(KEYNO)入力画面を検出 → SERIAL_NOで突破');
    await frame.fill('input[name="PASSWD_D"]', process.env.LOGIN_PASSWORD).catch(() => {});
    await frame.fill('input[name="KEYNO"]', process.env.SERIAL_NO);
    await Promise.all([page.waitForLoadState('networkidle').catch(() => {}), clickLoginImage(frame)]);
    await page.waitForTimeout(3500);
  } else {
    console.log('    シリアル入力なし（デバイス記憶済み）');
  }
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  page.on('dialog', async d => { console.log('[DIALOG]', d.message()); await d.accept().catch(() => {}); });

  console.log('[*] ログイン中...');
  await seinoLogin(page);
  console.log('[*] ログイン後URL:', page.url());
  await page.screenshot({ path: path.join(__dirname, 'step1-after-login.png'), fullPage: true });

  // ログイン状態を保存（次回デバイス記憶でシリアル不要にできるか検証用）
  await context.storageState({ path: path.join(__dirname, 'auth-state.json') });

  // 「仕分コードデータ…ダウンロード」リンクをクリック（新ウィンドウで開く）
  console.log('[*] 仕分コードデータ ダウンロードを開く');
  const popupPromise = context.waitForEvent('page', { timeout: 12000 }).catch(() => null);
  for (const f of page.frames()) {
    const clicked = await f.evaluate(() => {
      const a = [...document.querySelectorAll('a')].find(x => /仕分コードデータ.*ダウンロード/.test(x.innerText) && !/詳細/.test(x.innerText));
      if (a) { a.click(); return true; }
      return false;
    }).catch(() => false);
    if (clicked) break;
  }
  const popup = await popupPromise;
  const target = popup || page;
  await target.waitForLoadState('domcontentloaded').catch(() => {});
  await target.waitForTimeout(4000);
  console.log('    遷移先URL:', target.url());
  await target.screenshot({ path: path.join(__dirname, 'step2-master.png'), fullPage: true });

  // ダウンロードページの操作要素を抽出
  for (const f of target.frames()) {
    let els = [];
    try {
      els = await f.$$eval('a, input[type=submit], input[type=button], input[type=image], button, select', nodes =>
        nodes.map(e => ({ tag: e.tagName, type: e.type, text: (e.innerText || e.value || e.alt || '').trim().replace(/\s+/g, ' ').slice(0, 50), href: e.getAttribute('href'), onclick: e.getAttribute('onclick'), name: e.name })).filter(e => e.text || e.name));
    } catch {}
    if (els.length) {
      console.log(`=== 要素 in frame ${f.url()} ===`);
      console.log(JSON.stringify(els.slice(0, 40), null, 2));
    }
  }

  console.log('>>> 25秒開いたままにします');
  await page.waitForTimeout(25000);
  await browser.close();
})();
