# Playwright公式イメージ（Chromium＋全依存ライブラリ同梱）。Amazon Linux 2 の依存問題を回避。
# タグはローカルの playwright バージョンに合わせる。
FROM mcr.microsoft.com/playwright:v1.61.0-jammy

WORKDIR /app

# 依存だけ先に入れてレイヤキャッシュを効かせる
COPY package*.json ./
RUN npm ci --omit=dev

# アプリ本体
COPY . .

# 既定はcron入口。動作確認時は `docker run ... node download-masterpack.js` で上書き
CMD ["node", "daily.js"]
