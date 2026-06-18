// ===== ダウンロード完了通知メール =====
// SMTP設定は .env から。未設定なら送信スキップ（ローカル等で無害）。
const nodemailer = require('nodemailer');

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

  const tableText = (scheduleTable || [])
    .map(r => `  ${r.label}\tセット日 ${r.setDate}\t適用日 ${r.applyDate}`)
    .join('\n');

  const body =
`ヤマトビジネスメンバーズのマスタパックをダウンロードしました。

  日時      : ${now}
  ファイル  : ${result.filename}
  サイズ    : ${result.sizeKB} KB
  保存先    : ${destLabel || '(コンテナ内 /app/downloads)'}
  更新有無  : ${result.changed ? '更新あり' : '⚠ 前回と同一（まだ更新されていない可能性）'}

── マスタ更新スケジュール（セット日・適用日）──
${tableText}

※ 取得は「適用日の前日」に自動実行されます（スケジュールは変更される場合があります）。
`;

  await transporter.sendMail({
    from: MAIL_FROM || SMTP_USER,
    to: MAIL_TO,
    subject: `【SHIPP】ヤマト マスタパックDL完了 ${result.filename}（${now}）`,
    text: body,
  });

  console.log(`[notify] ダウンロード通知メールを送信: ${MAIL_TO}`);
}

module.exports = { sendDownloadNotification };
