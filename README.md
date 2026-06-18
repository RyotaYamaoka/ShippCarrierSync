# ShippCarrierSync — ヤマト マスタ自動取得

SHIPP のキャリア連携（運送会社マスタの自動取得）。第一弾としてヤマトビジネスメンバーズの
「マスタパックダウンロード」を Playwright で自動化したもの。

## 構成

| ファイル | 役割 |
|---|---|
| `daily.js` | cron から毎日叩く入口。スケジュール判定 → 必要日のみDL実行 |
| `check-schedule.js` | 公開ページ(Shift_JIS)から「適用日」を取得し本日が実行日か判定（ログイン不要） |
| `download-masterpack.js` | ログイン→EDIツール→マスタパックDL本体。単体実行・モジュール両対応 |
| `inspect-*.js` / `step*.js` | 開発・調査用（本番には不要） |

## 動作ロジック

毎日 cron 起動 →
1. 公開ページ `mst_download.html` を読み、各「適用日」と「適用日-1」を算出
2. 本日が「適用日の前日」または「適用日当日(未取得)」なら → マスタDL
3. それ以外は何もせず終了
4. `state.json` で取得済みを管理（冪等化、前日失敗時は当日リトライ）

## セットアップ

```bash
npm install
npx playwright install chromium      # Amazon Linux 2 は別途依存ライブラリの導入が必要
cp .env.example .env                 # .env に認証情報を記入
node check-schedule.js               # スケジュール確認
node daily.js                        # 実行（中で判定）
```

## cron (JST)

```cron
TZ=Asia/Tokyo
0 8 * * * cd /path/to/ShippCarrierSync && /usr/bin/node daily.js >> daily.log 2>&1
```

## 注意

- ヤマトのサイト稼働時間は 7:00〜25:00。cron はこの範囲内に。
- `.env` / `auth-state.json` / `state.json` / `downloads/` はコミットしない（`.gitignore`済み）。
- スケジュールページは Shift_JIS(WINDOWS-31J)。`TextDecoder('shift_jis')` でデコード必須。
