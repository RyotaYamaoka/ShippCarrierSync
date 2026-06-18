// ===== 西濃 マイセイノー: 仕分コードデータ(郵便番号仕分・一般/宅配) をダウンロード =====
// ログイン → (必要ならシリアルKEYNO) → 仕分コードデータDLページ → 対象2ファイルDL
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { chromium } = require('playwright');

const DOWNLOAD_DIR = process.env.MASTER_DEST || path.join(__dirname, 'downloads');

// ダウンロード対象（download('<path>') の引数で識別）
const TARGETS = [
  '/NFS/projpk/data/shiwake/data/01_YBNBANIPNALL/', // 郵便番号仕分コード 一般 YBNBANIPNALL(YYYYMMDD).zip
  '/NFS/projpk/data/shiwake/data/05_YBNBANTAKALL/', // 郵便番号仕分コード 宅配 YBNBANTAKALL(YYYYMMDD).zip
];

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
  let frame = page.frame({ name: 'loginFRAME' });
  if (!frame) throw new Error('loginFRAME が見つかりません');
  await frame.fill('input[name="loginid"]', process.env.LOGIN_ID);
  await frame.fill('input[name="passwd"]', process.env.LOGIN_PASSWORD);
  await Promise.all([page.waitForLoadState('networkidle').catch(() => {}), clickLoginImage(frame)]);
  await page.waitForTimeout(3500);

  // 未登録デバイスではシリアル(KEYNO)セットアップ画面になる
  frame = page.frame({ name: 'loginFRAME' }) || frame;
  const keyno = await frame.$('input[name="KEYNO"]').catch(() => null);
  if (keyno) {
    if (!process.env.SERIAL_NO) throw new Error('シリアル入力が要求されましたが SERIAL_NO が未設定です');
    console.log('    シリアル(KEYNO)で突破');
    await frame.fill('input[name="PASSWD_D"]', process.env.LOGIN_PASSWORD).catch(() => {});
    await frame.fill('input[name="KEYNO"]', process.env.SERIAL_NO);
    await Promise.all([page.waitForLoadState('networkidle').catch(() => {}), clickLoginImage(frame)]);
    await page.waitForTimeout(3500);
  }
}

(async () => {
  if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  const launchArgs = process.env.PW_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-dev-shm-usage'] : [];
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== 'false', args: launchArgs });
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    page.on('dialog', async d => { console.log('[DIALOG]', d.message()); await d.accept().catch(() => {}); });

    console.log('[1] ログイン');
    await seinoLogin(page);

    console.log('[2] 仕分コードデータDLページを直接開く');
    // メニューの openNewWindow('announce.do?...') 相当を、同一セッションの新ページで直接開く。
    // announce.do は act.seino.co.jp/kmd/MasterDataDownload.do へリダイレクトする。
    const ANNOUNCE_URL = process.env.SEINO_ANNOUNCE_URL
      || 'https://net.seino.co.jp/ninsyo/announce.do?action=&displayType=2&PROJECTID=K1859401';
    const dl = await context.newPage();
    await dl.goto(ANNOUNCE_URL, { waitUntil: 'domcontentloaded' });
    for (let i = 0; i < 15 && !/MasterDataDownload|\/kmd\//i.test(dl.url()); i++) {
      await dl.waitForTimeout(1000);
    }
    if (!/MasterDataDownload|\/kmd\//i.test(dl.url())) {
      throw new Error('MasterDataDownload へ遷移しませんでした: ' + dl.url());
    }
    await dl.waitForLoadState('domcontentloaded').catch(() => {});
    await dl.waitForTimeout(2000);
    console.log('    DLページ:', dl.url());

    console.log('[3] 対象ファイルをダウンロード');
    const saved = [];
    for (const target of TARGETS) {
      const ok = await dl.evaluate((t) => {
        const btn = [...document.querySelectorAll('input[type=button],input[type=submit],button')]
          .find(b => (b.getAttribute('onclick') || '').includes(t));
        return !!btn;
      }, target);
      if (!ok) { console.log('    !! ボタンが見つからない:', target); continue; }
      const downloadPromise = dl.waitForEvent('download', { timeout: 60000 });
      await dl.evaluate((t) => {
        const btn = [...document.querySelectorAll('input[type=button],input[type=submit],button')]
          .find(b => (b.getAttribute('onclick') || '').includes(t));
        btn.click();
      }, target);
      const download = await downloadPromise;
      const fn = download.suggestedFilename();
      const savePath = path.join(DOWNLOAD_DIR, fn);
      await download.saveAs(savePath);
      const kb = (fs.statSync(savePath).size / 1024).toFixed(1);
      console.log(`    ✓ ${fn} (${kb} KB) -> ${savePath}`);
      saved.push({ fn, savePath, kb });
      await dl.waitForTimeout(1500);
    }
    console.log(`[完了] ${saved.length}/${TARGETS.length} 件 取得`);
  } finally {
    await browser.close();
  }
})().catch(err => { console.error('!! エラー:', err.message); process.exit(1); });
