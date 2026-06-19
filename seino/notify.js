// ===== 西濃 仕分コードマスタ ダウンロード完了通知メール =====
// SMTP設定は .env から。未設定なら送信スキップ。
const nodemailer = require('nodemailer');

// saved: [{ fn(zip名), extracted: [{ name, mb }] }]
async function sendDownloadNotification({ saved, destLabel }) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, MAIL_TO } = process.env;
  if (!SMTP_HOST || !MAIL_TO) {
    console.log('[notify] SMTP未設定（SMTP_HOST/MAIL_TO）のためメール送信をスキップ');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: false,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const rows = (saved || []).flatMap(s =>
    (s.extracted || []).map(e => ({ zip: s.fn, file: e.name, mb: e.mb })));

  const textLines = rows.map(r => `  ${r.file} (${r.mb} MB)  ← ${r.zip}`).join('\n');
  const body =
`西濃運輸 仕分コードマスタをダウンロード・解凍しました。

  日時      : ${now}
  保存先    : ${destLabel || '(コンテナ内 /app/seino/downloads)'}

── 取得ファイル（解凍済み）──
${textLines}
`;

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const td = 'style="border:1px solid #ccc;padding:4px 10px;"';
  const th = 'style="border:1px solid #ccc;padding:4px 10px;background:#f3f3f3;text-align:center;"';
  const rowsHtml = rows.map(r =>
    `<tr><td ${td}>${esc(r.file)}</td><td ${td} align="right">${esc(r.mb)} MB</td><td ${td}>${esc(r.zip)}</td></tr>`).join('');
  const html =
`<div style="font-family:'Segoe UI',Meiryo,sans-serif;font-size:14px;color:#333;">
  <p>西濃運輸 仕分コードマスタをダウンロード・解凍しました。</p>
  <table style="border-collapse:collapse;margin:8px 0;">
    <tr><td ${td}>日時</td><td ${td}>${esc(now)}</td></tr>
    <tr><td ${td}>保存先</td><td ${td}>${esc(destLabel || '(コンテナ内 /app/seino/downloads)')}</td></tr>
  </table>
  <p style="margin:14px 0 6px;font-weight:bold;">取得ファイル（解凍済み）</p>
  <table style="border-collapse:collapse;">
    <tr><th ${th}>ファイル</th><th ${th}>サイズ</th><th ${th}>元zip</th></tr>
    ${rowsHtml}
  </table>
</div>`;

  await transporter.sendMail({
    from: MAIL_FROM || SMTP_USER,
    to: MAIL_TO,
    subject: `【SHIPP】西濃 仕分コードマスタDL完了（${now}）`,
    text: body,
    html,
  });
  console.log(`[notify] ダウンロード通知メールを送信: ${MAIL_TO}`);
}

module.exports = { sendDownloadNotification };
