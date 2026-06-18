// ===== ヤマトビジネスメンバーズ: 通常版マスタパック(lzh) ダウンロード =====
// 流れ: ログイン → EDIツール → マスタパックDLページ → 通常版lzhをダウンロード
// 使い方:
//   - 単体実行 : node download-masterpack.js
//   - モジュール: const { downloadMasterpack } = require('./download-masterpack');
require('dotenv').config();
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
// どのボタンを押すか（必要なら .env の DL_FUNC で上書き可）
const DL_FUNC = process.env.DL_FUNC || 'M_PAC_DOWNLORD'; // 通常版lzh

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
  if (!page.url().includes('LOGGEDIN')) throw new Error('ログインに失敗しました。.env の認証情報を確認してください。');
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// 退避ファイルの保持世代数（これより古いものは削除）
const RETAIN_GENERATIONS = Number(process.env.RETAIN_GENERATIONS || 12);

// 退避ファイル（base_YYYYMMDD_HHMMSS.ext）を新しい順に keep 個だけ残し、古いものを削除
function pruneArchives(dir, filename, keep) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  const re = new RegExp(`^${base}_\\d{8}_\\d{6}${ext.replace(/\./g, '\\.')}$`);
  const archives = fs.readdirSync(dir).filter(f => re.test(f)).sort(); // 名前昇順=古い順
  for (let i = 0; i < archives.length - keep; i++) {
    fs.unlinkSync(path.join(dir, archives[i]));
    console.log('      古い退避を削除:', archives[i]);
  }
}

// 退避ファイル名用の YYYYMMDD_HHMMSS（JST）
function stampJST(d) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d);
  const g = t => p.find(x => x.type === t).value;
  return `${g('year')}${g('month')}${g('day')}_${g('hour')}${g('minute')}${g('second')}`;
}

// マスタパックをダウンロードして downloads/ に保存。
// 戻り値: { savePath, filename, sizeKB, changed } changed=前回と中身が変わったか
async function downloadMasterpack() {
  if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

  // EC2(Linux)では画面が無いので headless がデフォルト。ローカルで見たい時は HEADLESS=false
  // コンテナ内では PW_NO_SANDBOX=1 を付ける（root実行のsandbox問題・/dev/shm不足対策）
  const launchArgs = process.env.PW_NO_SANDBOX === '1'
    ? ['--no-sandbox', '--disable-dev-shm-usage']
    : [];
  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== 'false',
    args: launchArgs,
  });
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    page.on('dialog', async d => { console.log('[DIALOG]', d.message()); await d.accept().catch(() => {}); });

    console.log('[1] ログイン中...');
    await login(page);
    console.log('    ✓ ログイン成功');

    console.log('[2] EDIツールを開く...');
    await page.evaluate(() => ybmCommonJs.useService('22', '2'));
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(3000);

    console.log('[3] マスタパックダウンロードページへ...');
    await page.evaluate(() =>
      useServiceSV0301(new Event('click'), '01',
        'https://ybmsubsys.kuronekoyamato.co.jp/ybmsubsys/RelationStart?func=14', '1', '0', '22')
    );
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(3500);

    console.log(`[4] 通常版マスタパック(lzh)をダウンロード func_downLoad('${DL_FUNC}')`);
    const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
    await page.evaluate((fn) => func_downLoad(fn), DL_FUNC);
    const download = await downloadPromise;

    const filename = download.suggestedFilename();
    const savePath = path.join(DOWNLOAD_DIR, filename);

    // ダウンロード前のハッシュ（更新検証用）
    const prevHash = fs.existsSync(savePath) ? sha256(savePath) : null;

    // 既存ファイルは上書きせず、旧ファイルの取得日時を付けて退避（残す）
    if (fs.existsSync(savePath)) {
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      const archived = path.join(DOWNLOAD_DIR, `${base}_${stampJST(fs.statSync(savePath).mtime)}${ext}`);
      fs.renameSync(savePath, archived);
      console.log('      旧ファイルを退避:', path.basename(archived));
    }
    await download.saveAs(savePath);

    // 退避ファイルは最新 RETAIN_GENERATIONS 世代のみ保持し、古いものを削除
    pruneArchives(DOWNLOAD_DIR, filename, RETAIN_GENERATIONS);

    const size = fs.statSync(savePath).size;
    if (size === 0) throw new Error('ダウンロードしたファイルのサイズが0です。');
    const newHash = sha256(savePath);
    const changed = prevHash === null ? true : prevHash !== newHash;

    console.log('    ✓ ダウンロード完了');
    console.log('      ファイル名:', filename);
    console.log('      保存先   :', savePath);
    console.log('      サイズ   :', (size / 1024).toFixed(1), 'KB');
    console.log('      前回比   :', changed ? '内容が更新されています' : '⚠ 前回と同一（まだ更新されていない可能性）');

    const result = { savePath, filename, sizeKB: +(size / 1024).toFixed(1), changed };

    // ダウンロード完了通知メール（ベストエフォート：失敗してもDLは成功扱い）
    try {
      const { fetchScheduleTable } = require('./check-schedule');
      const { sendDownloadNotification } = require('./notify');
      const scheduleTable = await fetchScheduleTable();
      await sendDownloadNotification({ result, scheduleTable, destLabel: process.env.MAIL_DEST_LABEL });
    } catch (e) {
      console.log('[notify] メール送信に失敗（DLは成功）:', e.message);
    }

    return result;
  } finally {
    await browser.close();
  }
}

module.exports = { downloadMasterpack };

// 単体実行された時だけ走る
if (require.main === module) {
  downloadMasterpack()
    .then(() => console.log('\n=== 完了 ==='))
    .catch(err => { console.error('!! エラー:', err.message); process.exit(1); });
}
