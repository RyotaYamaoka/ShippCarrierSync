#!/bin/bash
# ヤマト マスタパックを取得し、SHIPPの保存先に置く（手動/動作確認用の強制DL）。
# 保存先はデフォルトで /var/www/html/s3/transports/yamato。MASTER_DEST で上書き可。
set -euo pipefail
cd "$(dirname "$0")"

DEST="${MASTER_DEST:-/var/www/html/s3/transports/yamato}"
IMAGE="${IMAGE:-shipp-carrier-sync}"

mkdir -p "$DEST"

echo "[run-download] 保存先: $DEST"
docker run --rm \
  -e PW_NO_SANDBOX=1 \
  -e MAIL_DEST_LABEL="$DEST" \
  --env-file .env \
  -v "$DEST:/app/downloads" \
  "$IMAGE" node download-masterpack.js

# コンテナはroot実行なので、出力ファイルを ec2-user に揃える
sudo chown -R ec2-user:ec2-user "$DEST"

echo "[run-download] 完了:"
ls -la "$DEST"
