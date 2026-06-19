// ===== 西濃 マイセイノー: 仕分コードデータ(郵便番号仕分・一般/宅配) をダウンロード =====
// ログイン → (必要ならシリアルKEYNO) → 仕分コードデータDLページ → 対象2ファイルDL
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
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

// ID/パスワードでログインを1回試行。KEYNO(シリアル)セットアップ画面が出たら登録して true を返す。
async function attemptLogin(page) {
  await page.goto(process.env.LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  let frame = page.frame({ name: 'loginFRAME' });
  if (!frame) throw new Error('loginFRAME が見つかりません');
  await frame.fill('input[name="loginid"]', process.env.LOGIN_ID);
  await frame.fill('input[name="passwd"]', process.env.LOGIN_PASSWORD);
  await Promise.all([page.waitForLoadState('networkidle').catch(() => {}), clickLoginImage(frame)]);
  await page.waitForTimeout(3500);

  frame = page.frame({ name: 'loginFRAME' }) || frame;
  const keyno = await frame.$('input[name="KEYNO"]').catch(() => null);
  if (keyno) {
    if (!process.env.SERIAL_NO) throw new Error('シリアル入力が要求されましたが SERIAL_NO が未設定です');
    console.log('    シリアル(KEYNO)でデバイス登録');
    await frame.fill('input[name="PASSWD_D"]', process.env.LOGIN_PASSWORD).catch(() => {});
    await frame.fill('input[name="KEYNO"]', process.env.SERIAL_NO);
    await Promise.all([page.waitForLoadState('networkidle').catch(() => {}), clickLoginImage(frame)]);
    await page.waitForTimeout(3500);
    return true; // セットアップした＝再ログインが必要
  }
  return false;
}

async function seinoLogin(page) {
  // 1回目: 未登録デバイスはここでシリアル登録される（その直後セッションは未ログイン扱い）
  const didSetup = await attemptLogin(page);
  if (didSetup) {
    // デバイス登録後は「もう一度ログイン」が必要。今度はcookieで認識され KEYNO は出ない
    console.log('    デバイス登録後の再ログイン');
    await attemptLogin(page);
  }
}

(async () => {
  if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  const launchArgs = process.env.PW_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-dev-shm-usage'] : [];
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== 'false', args: launchArgs });
  let context, page;
  try {
    context = await browser.newContext({ acceptDownloads: true });
    page = await context.newPage();
    page.on('dialog', async d => { console.log('[DIALOG]', d.message()); await d.accept().catch(() => {}); });

    console.log('[1] ログイン');
    await seinoLogin(page);

    console.log('[2] 仕分コードデータDLページを開く（メニュー文脈でopenNewWindow）');
    // 実ユーザーと同じく、メニューページのJS文脈で openNewWindow を呼んで子ウィンドウで開く。
    // （直接gotoだとセッション受け渡しが切れて認証エラーになるため）
    const PROJECT_URL = process.env.SEINO_PROJECT_URL
      || 'announce.do?action=&displayType=2&PROJECTID=K1859401';
    const popupPromise = context.waitForEvent('page', { timeout: 20000 }).catch(() => null);
    let invoked = false;
    for (const f of page.frames()) {
      const ok = await f.evaluate((u) => {
        if (typeof openNewWindow === 'function') { openNewWindow(u, 'K1859401'); return true; }
        return false;
      }, PROJECT_URL).catch(() => false);
      if (ok) { invoked = true; break; }
    }
    if (!invoked) throw new Error('openNewWindow がどのフレームにも見つかりません');

    let dl = await popupPromise;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(1000);
      const found = context.pages().find(p => /MasterDataDownload|\/kmd\//i.test(p.url()));
      if (found) { dl = found; break; }
    }
    if (!dl || !/MasterDataDownload|\/kmd\//i.test(dl.url())) {
      if (dl) {
        const txt = await dl.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 400)).catch(() => '');
        console.log('[診断] 遷移先URL:', dl.url());
        console.log('[診断] TEXT:', txt);
      }
      // ログイン後メニューのURLも確認
      console.log('[診断] メインページURL:', page.url());
      throw new Error('MasterDataDownload へ遷移しませんでした: ' + (dl && dl.url()));
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
      console.log(`    ✓ ${fn} (${kb} KB)`);

      // zipを解凍（中の.txtを保存先に展開）→ zip本体は削除
      try {
        const zip = new AdmZip(savePath);
        const entries = zip.getEntries().map(e => e.entryName);
        zip.extractAllTo(DOWNLOAD_DIR, true); // 既存は上書き
        fs.unlinkSync(savePath);
        console.log(`      解凍 -> ${entries.join(', ')}（zip削除）`);
        saved.push({ fn, extracted: entries });
      } catch (e) {
        console.log('      !! 解凍失敗（zipは残す）:', e.message);
        saved.push({ fn, extracted: [] });
      }
      await dl.waitForTimeout(1500);
    }
    console.log(`[完了] ${saved.length}/${TARGETS.length} 件 取得`);
  } finally {
    // セッションを溜めないため、成功/失敗どちらでも必ずログアウトする
    if (context && page) {
      try {
        console.log('[*] ログアウト（セッション終了）');
        // メインページの「ログアウト」リンクを押す
        for (const f of page.frames()) {
          await f.evaluate(() => {
            const a = [...document.querySelectorAll('a,[onclick]')].find(x =>
              /ログアウト|logout/i.test((x.innerText || '') + (x.getAttribute('onclick') || '') + (x.getAttribute('href') || '')));
            if (a) a.click();
          }).catch(() => {});
        }
        await page.waitForTimeout(2000);
        // act側セッションも明示終了
        const p = await context.newPage();
        await p.goto('https://act.seino.co.jp/ninsyo/sessionEnd.do', { waitUntil: 'domcontentloaded' }).catch(() => {});
        await p.waitForTimeout(1500);
      } catch (e) { console.log('    ログアウト処理でエラー（無視）:', e.message); }
    }
    await browser.close();
  }
})().catch(err => { console.error('!! エラー:', err.message); process.exit(1); });
