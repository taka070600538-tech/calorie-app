# 写真からの食事記録機能 設計書

日付: 2026-08-10
ステータス: 承認済み

## 目的

スマホで撮影した料理写真から、メニュー名・量・栄養値（カロリー/PFC/塩分）をAIで推定し、
食事記録に反映できるようにする。外食や弁当など食品DBに無い料理もその場で記録できる。

## 決定事項（ユーザー承認済み）

1. **推定方式**: Claude Vision API（`claude-opus-5`）を使う。APIキーは設定タブでユーザー自身が保存する。
   既存の「外部通信なし」方針に対し、GitHubバックアップと同様「ユーザーがキーを設定した場合のみ通信する機能」として明示的な例外とする。
2. **記録方式**: AIの栄養推定値を直接記録する。認識した料理は食品DBにも自動登録し、次回から手入力検索でも使える。
3. **写真保存**: 保存しない。認識に使うだけで、記録にはメニュー名と栄養値だけが残る。

## 全体フロー

1. 「今日の記録」の各食事セクション（朝食/昼食/夕食/間食）に「📷 写真から追加」ボタンを追加
2. タップでカメラ起動（`<input type="file" accept="image/*" capture="environment">`）
3. 撮影画像をcanvasで縮小（長辺1568px・JPEG品質0.85）してbase64化
4. Claude APIへ送信（Vision + 構造化出力）。品目リストをJSONで受け取る:
   `{"items": [{"name", "amountGrams", "kcal", "protein", "fat", "carb", "salt"}]}`
   （一枚の写真から複数品目に対応。食べ物が写っていなければ空リスト）
5. 確認モーダルで品目ごとにメニュー名・量・栄養値を表示。各値は編集可、不要品目は削除可
6. 保存で:
   - 各品目を `meals` ストアに記録（既存の手入力記録と同じ構造: date, mealType, foodId, amountGrams, kcal, protein, fat, carb, salt）
   - 各品目をper100g換算して `foods` ストアにも自動登録（同名食品が既にあればスキップし、既存食品のIDを参照）

## API呼び出し

- ブラウザから直接 `fetch`（ビルドなし静的PWAのためSDK不使用）
- エンドポイント: `POST https://api.anthropic.com/v1/messages`
- ヘッダー: `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`,
  `anthropic-dangerous-direct-browser-access: true`（ブラウザ直接アクセスに必須）
- モデル: `claude-opus-5`
- 構造化出力: `output_config.format` に `json_schema` を指定（items配列、各項目 name/amountGrams/kcal/protein/fat/carb/salt、additionalProperties: false）
- max_tokens: 4096（意図的に短い出力のため）
- 画像: base64のimageブロック + 指示テキスト（日本語でメニュー名、量g、栄養値を推定させる）

## APIキー管理

- 設定タブに「Anthropic APIキー」入力欄を追加
- IndexedDBの設定ストアに保存（GitHub PATと同じパターン）
- **GitHubバックアップ（backup.json）には含めない**

## エラー処理

- APIキー未設定 → 「設定タブでAnthropic APIキーを登録してください」と案内
- 通信失敗/APIエラー → メッセージ表示 + 再試行ボタン
- 認識結果が空 → 「料理を認識できませんでした」と表示
- レスポンスのバリデーション: 数値フィールドが非負数であること、nameが非空であることを検証

## テスト

- レスポンスJSONのパース・バリデーション、per100g換算ロジックを `node --test` でユニットテスト（fetchはモック）
- 実機確認: ローカルサーバー + 実料理写真での動作確認

## その他

- README.mdに機能説明・APIキー設定手順・コスト目安（1回数円程度）を追記
- `sw.js` の CACHE_NAME を上げる（cache-firstのため必須）
