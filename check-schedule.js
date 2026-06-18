// ===== ヤマト マスタ更新スケジュールの取得（公開ページ・ログイン不要） =====
// mst_download.html は Shift_JIS(WINDOWS-31J) の静的ページ。
// 「適用日」12件をパースし、各「適用日」と「適用日-1」の実日付を返す。
const SCHEDULE_URL = 'https://bmypage.kuronekoyamato.co.jp/bmypage/mst_download.html';

// "M月D日" の羅列から {month, day} 配列を作る
function parseApplyDates(text) {
  // 「適用日」ラベル以降の最初の12個の "M月D日" を拾う（注意事項等の誤検出を防ぐため12件で打ち切り）
  const after = text.split('適用日')[1] || '';
  const matches = [...after.matchAll(/(\d{1,2})月(\d{1,2})日/g)].slice(0, 12);
  return matches.map(m => ({ month: +m[1], day: +m[2] }));
}

// 日付を YYYY-MM-DD（ローカル日付）で表現
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// month/day を「今日に最も近い実日付」に変換（年は前後1年も候補にして最近接を選ぶ）
function nearestDate(month, day, today) {
  const y = today.getFullYear();
  const candidates = [y - 1, y, y + 1].map(yy => new Date(yy, month - 1, day));
  candidates.sort((a, b) => Math.abs(a - today) - Math.abs(b - today));
  return candidates[0];
}

// 公開ページを取得 → Shift_JISでデコード → 適用日スケジュールを返す
async function fetchSchedule() {
  const res = await fetch(SCHEDULE_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`スケジュールページ取得失敗: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const html = new TextDecoder('shift_jis').decode(buf); // ★Shift_JIS必須
  const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  const applyMD = parseApplyDates(plain);
  if (applyMD.length < 12) {
    throw new Error(`適用日のパースに失敗しました（取得 ${applyMD.length} 件）。ページ構成が変わった可能性があります。`);
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  return applyMD.map(({ month, day }) => {
    const apply = nearestDate(month, day, today);
    const dayBefore = new Date(apply); dayBefore.setDate(apply.getDate() - 1);
    return { applyDate: ymd(apply), dayBeforeApply: ymd(dayBefore) };
  });
}

// 今日がDL実行日か判定する。
//   - 今日が「適用日-1」 → 実行（targetApply=その適用日）
//   - 今日が「適用日」かつ その適用日をまだ取得していない → リトライ実行
// state.lastApply には「最後に取得成功した適用日(YYYY-MM-DD)」を入れておく
function decide(schedule, todayStr, lastApply) {
  for (const s of schedule) {
    if (todayStr === s.dayBeforeApply) {
      return { run: true, reason: `適用日(${s.applyDate})の前日`, targetApply: s.applyDate };
    }
    if (todayStr === s.applyDate && lastApply !== s.applyDate) {
      return { run: true, reason: `適用日(${s.applyDate})当日・未取得のためリトライ`, targetApply: s.applyDate };
    }
  }
  return { run: false, reason: '本日は実行日ではありません', targetApply: null };
}

// 公開ページからセット日・適用日の年間表を取得（メール本文等の表示用）
async function fetchScheduleTable() {
  const res = await fetch(SCHEDULE_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`スケジュールページ取得失敗: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const plain = new TextDecoder('shift_jis').decode(buf).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const setDates = [...(plain.split('セット日')[1] || '').matchAll(/(\d{1,2})月(\d{1,2})日/g)].slice(0, 12);
  const applyDates = [...(plain.split('適用日')[1] || '').matchAll(/(\d{1,2})月(\d{1,2})日/g)].slice(0, 12);
  const rows = [];
  for (let i = 0; i < 12; i++) {
    const s = setDates[i], a = applyDates[i];
    // 月度はセット日の月に一致（5月度=5/26セット, 9月度=9/26セット 等）
    rows.push({ label: s ? `${+s[1]}月度` : '', setDate: s ? s[0] : '', applyDate: a ? a[0] : '' });
  }
  return rows;
}

module.exports = { fetchSchedule, fetchScheduleTable, decide, ymd };

// 単体実行: スケジュールと本日の判定を表示
if (require.main === module) {
  (async () => {
    const schedule = await fetchSchedule();
    console.log('=== 取得した適用日スケジュール ===');
    schedule.forEach(s => console.log(`  適用日 ${s.applyDate}  (実行日=前日 ${s.dayBeforeApply})`));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr = ymd(today);
    console.log('\n本日:', todayStr);
    console.log('判定:', decide(schedule, todayStr, null));
  })().catch(err => { console.error('!! エラー:', err.message); process.exit(1); });
}
