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

// マスタパックをダウンロードして downloads/ に保存。
// 戻り値: { savePath, filename, sizeKB, changed } changed=前回と中身が変わったか
async function downloadMasterpack() {
  if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

  // EC2(Linux)では画面が無いので headless がデフォルト。ローカルで見たい時は HEADLESS=false
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== 'false' });
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
    await download.saveAs(savePath);

    const size = fs.statSync(savePath).size;
    if (size === 0) throw new Error('ダウンロードしたファイルのサイズが0です。');
    const newHash = sha256(savePath);
    const changed = prevHash === null ? true : prevHash !== newHash;

    console.log('    ✓ ダウンロード完了');
    console.log('      ファイル名:', filename);
    console.log('      保存先   :', savePath);
    console.log('      サイズ   :', (size / 1024).toFixed(1), 'KB');
    console.log('      前回比   :', changed ? '内容が更新されています' : '⚠ 前回と同一（まだ更新されていない可能性）');

    return { savePath, filename, sizeKB: +(size / 1024).toFixed(1), changed };
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
