#!/bin/bash
# 西濃 仕分コードマスタ(郵便番号仕分・一般/宅配)を取得し、SHIPPの保存先へ置く。
# 保存先デフォルト /var/www/html/s3/transports/seino（MASTER_DEST で上書き可）。
set -euo pipefail
cd "$(dirname "$0")"

DEST="${MASTER_DEST:-/var/www/html/s3/transports/seino}"
IMAGE="${IMAGE:-shipp-carrier-sync}"

mkdir -p "$DEST"

echo "[seino] 保存先: $DEST"
docker run --rm \
  -e PW_NO_SANDBOX=1 \
  --env-file .env \
  -v "$DEST:/app/seino/downloads" \
  "$IMAGE" node seino/download-master.js

# コンテナはroot実行なので、出力ファイルを ec2-user に揃える
sudo chown -R ec2-user:ec2-user "$DEST"

echo "[seino] 完了:"
ls -la "$DEST"
