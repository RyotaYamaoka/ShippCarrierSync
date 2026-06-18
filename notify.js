// ===== ダウンロード完了通知メール =====
// SMTP設定は .env から。未設定なら送信スキップ（ローカル等で無害）。
const nodemailer = require('nodemailer');

// 全角文字を幅2として表示幅を計算（等幅フォントでの桁揃え用）
function dispWidth(s) {
  let w = 0;
  for (const ch of String(s)) w += ch.charCodeAt(0) > 0x7f ? 2 : 1;
  return w;
}
function padCell(s, width) {
  return String(s) + ' '.repeat(Math.max(0, width - dispWidth(s)));
}
// ASCII罫線テーブルを組み立てる
function asciiTable(headers, rows) {
  const widths = headers.map((h, i) =>
    Math.max(dispWidth(h), ...rows.map(r => dispWidth(r[i]))));
  const sep = '+' + widths.map(w => '-'.repeat(w + 2)).join('+') + '+';
  const line = cells => '|' + cells.map((c, i) => ' ' + padCell(c, widths[i]) + ' ').join('|') + '|';
  return [sep, line(headers), sep, ...rows.map(line), sep].join('\n');
}

// scheduleTable: [{ label, setDate, applyDate }]（check-schedule.fetchScheduleTable の戻り値）
async function sendDownloadNotification({ result, scheduleTable, destLabel }) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, MAIL_TO } = process.env;
  if (!SMTP_HOST || !MAIL_TO) {
    console.log('[notify] SMTP未設定（SMTP_HOST/MAIL_TO）のためメール送信をスキップ');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: false, // 587 はSTARTTLS
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

  const tableText = asciiTable(
    ['月度', 'セット日', '適用日'],
    (scheduleTable || []).map(r => [r.label, r.setDate, r.applyDate])
  );

  const changedText = result.changed ? '更新あり' : '⚠ 前回と同一（まだ更新されていない可能性）';
  const dest = destLabel || '(コンテナ内 /app/downloads)';

  // プレーンテキスト版（HTML非対応クライアント用）
  const body =
`ヤマトビジネスメンバーズのマスタパックをダウンロードしました。

  日時      : ${now}
  ファイル  : ${result.filename}
  サイズ    : ${result.sizeKB} KB
  保存先    : ${dest}
  更新有無  : ${changedText}

── マスタ更新スケジュール（セット日・適用日）──
${tableText}

※ 取得は「適用日の前日」に自動実行されます（スケジュールは変更される場合があります）。
`;

  // HTML版
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const td = 'style="border:1px solid #ccc;padding:4px 10px;"';
  const th = 'style="border:1px solid #ccc;padding:4px 10px;background:#f3f3f3;text-align:center;"';
  const rowsHtml = (scheduleTable || []).map(r =>
    `<tr><td ${td}>${esc(r.label)}</td><td ${td} align="center">${esc(r.setDate)}</td><td ${td} align="center">${esc(r.applyDate)}</td></tr>`
  ).join('');
  const html =
`<div style="font-family:'Segoe UI',Meiryo,sans-serif;font-size:14px;color:#333;">
  <p>ヤマトビジネスメンバーズのマスタパックをダウンロードしました。</p>
  <table style="border-collapse:collapse;margin:8px 0;">
    <tr><td ${td}>日時</td><td ${td}>${esc(now)}</td></tr>
    <tr><td ${td}>ファイル</td><td ${td}>${esc(result.filename)}</td></tr>
    <tr><td ${td}>サイズ</td><td ${td}>${esc(String(result.sizeKB))} KB</td></tr>
    <tr><td ${td}>保存先</td><td ${td}>${esc(dest)}</td></tr>
    <tr><td ${td}>更新有無</td><td ${td}>${esc(changedText)}</td></tr>
  </table>
  <p style="margin:14px 0 6px;font-weight:bold;">マスタ更新スケジュール（セット日・適用日）</p>
  <table style="border-collapse:collapse;">
    <tr><th ${th}>月度</th><th ${th}>セット日</th><th ${th}>適用日</th></tr>
    ${rowsHtml}
  </table>
  <p style="color:#888;font-size:12px;margin-top:14px;">※ 取得は「適用日の前日」に自動実行されます（スケジュールは変更される場合があります）。</p>
</div>`;

  await transporter.sendMail({
    from: MAIL_FROM || SMTP_USER,
    to: MAIL_TO,
    subject: `【SHIPP】ヤマト マスタパックDL完了 ${result.filename}（${now}）`,
    text: body,
    html,
  });

  console.log(`[notify] ダウンロード通知メールを送信: ${MAIL_TO}`);
}

module.exports = { sendDownloadNotification };
