// ===== cron から毎日叩く入口 =====
// 1. 公開ページから適用日スケジュールを取得（ログイン不要・軽量）
// 2. 今日が「適用日-1」or「適用日(未取得)」なら → マスタDL実行
// 3. それ以外の日は何もせず終了
//
// cron例 (JST・毎朝8時):
//   TZ=Asia/Tokyo
//   0 8 * * * cd /path/to/login-scraper && /usr/bin/node daily.js >> daily.log 2>&1
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { fetchSchedule, decide, ymd } = require('./check-schedule');
const { downloadMasterpack } = require('./download-masterpack');

const STATE_FILE = path.join(__dirname, 'state.json');

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { lastApply: null }; }
}
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

(async () => {
  const ts = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  console.log(`\n========== ${ts} daily.js 起動 ==========`);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = ymd(today);
  const state = loadState();

  // [1] 公開ページからスケジュール取得
  const schedule = await fetchSchedule();

  // [2] 本日が実行日か判定
  const d = decide(schedule, todayStr, state.lastApply);
  console.log(`本日 ${todayStr}: ${d.reason}`);

  if (!d.run) {
    console.log('→ 何もせず終了');
    return;
  }

  // [3] 実行日 → マスタDL
  console.log(`→ マスタダウンロードを実行します（対象適用日: ${d.targetApply}）`);
  const result = await downloadMasterpack();

  // 取得成功を記録（冪等化：同じ適用日では二度実行しない）
  state.lastApply = d.targetApply;
  state.lastDownloadAt = new Date().toISOString();
  state.lastFile = result.filename;
  state.lastChanged = result.changed;
  saveState(state);

  if (!result.changed) {
    // 前日実行で「まだ未更新（前回と同一）」の場合、当日の自動リトライに賭けるため記録を取り消す
    console.log('⚠ 取得したマスタが前回と同一でした。翌日のリトライ対象として記録を保留します。');
    state.lastApply = null;
    saveState(state);
  }

  console.log('=== daily.js 完了 ===');
})().catch(err => {
  console.error('!! daily.js エラー:', err.message);
  // TODO: ここで失敗通知（メール/Slack等）を送ると「サイレント失敗」を防げる
  process.exit(1);
});
