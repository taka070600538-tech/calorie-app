# 食品固有栄養素の登録と日次合計表示 設計書

日付: 2026-08-11

## 目的

食品固有の栄養素(DHA、EPA、ALA、ポリフェノールなど)を100gあたりの含有量とともに
食品に登録できるようにし、その食品を含む食事を記録した日は「今日の記録」の
栄養サマリー(塩分の行の直下)にその日の合計量を表示する。

## 方針(ユーザー確認済み)

- **項目の管理**: 自由入力+サジェスト。栄養素名は任意の文字列で、過去に使った名前を
  入力候補(datalist)として出す。固定リストやマスター画面は作らない。
- **表示形式**: 合計値のみ。目標値・進捗バーは付けない。
- **単位**: 栄養素ごとに mg / g / µg から選択。同じ栄養素名は同じ単位に揃える前提で、
  既出の名前を選んだときは単位も自動で追従させる。

## データモデル

### foods(食品)

任意フィールド `extraNutrients` を追加する。未設定の既存食品はそのままでよい
(IndexedDBは任意フィールドを保存できるため、DB_VERSION据え置き・マイグレーション不要)。

```js
{
  id, name, per100g: { kcal, protein, fat, carb, salt },
  extraNutrients: [           // 任意。空配列なら保存時にフィールドごと省略
    { name: 'DHA', unit: 'mg', per100g: 860 },
    { name: 'EPA', unit: 'mg', per100g: 930 },
  ],
}
```

### meals(食事記録)

既存の kcal〜salt と同じく、**保存時に量に応じて計算した値をコピー保存**する。
後から食品を編集しても過去の記録は変わらない、という現行方式との一貫性を保つ。

```js
{
  id, date, mealType, foodId, amountGrams,
  kcal, protein, fat, carb, salt,
  extras: [                   // 任意。extraNutrientsが無い食品なら省略
    { name: 'DHA', unit: 'mg', amount: 1290 },
  ],
}
```

### バックアップ

GitHubバックアップ(app-sync)は foods / meals を全件ダンプする方式のため、
追加フィールドは自動で含まれる。バックアップ側の変更は不要。

## 変更するモジュール

### nutrition.js

- `calcExtrasForAmount(extraNutrients, amountGrams)` — 100gあたり量から実量を計算。
  丸めは小数第1位(既存のprotein等と同じ `Math.round(x * 10) / 10`)。
- `sumExtras(meals)` — その日の全食事の `extras` を名前ごとに合算して
  `[{ name, unit, amount }]` を返す。順序は名前の五十音順(localeCompare 'ja')。
  `extras` が無い食事は空として扱う。単位は最初に現れたものを使う
  (同名同単位が前提。混在した場合も落ちずに最初の単位で表示する)。

### foodForm.js(食品登録・編集フォーム)

- 塩分欄の下に「固有栄養素」セクションを追加。
  - 「＋ 栄養素を追加」ボタンで行を追加。各行 = 栄養素名(text)・単位(select: mg/g/µg)・
    100gあたり量(number, min 0, step 0.1)・行の削除ボタン。
  - 栄養素名の input には datalist で、登録済み全食品の extraNutrients から集めた
    既出名をサジェスト。既出名と一致したら単位selectをその名前の単位に自動セット。
  - 保存時: 名前が空の行と量が未入力の行は無視。有効な行が0件なら
    `extraNutrients` フィールド自体を付けない。
  - 編集時(fillForm): 既存の extraNutrients を行として復元。
  - 成分表・料理検索からのフィル(fillFormFromMext / fillFormFromDish)では
    固有栄養素行はクリアする(元データに固有栄養素は無いため)。

### mealForm.js(食事追加・編集モーダル)

- プレビュー(updatePreview)に、量に応じた固有栄養素値を追記表示
  (例: `… 塩分1.2g / DHA 1290mg EPA 1395mg`)。
- 保存(doSave)時に `calcExtrasForAmount` の結果を `extras` として保存。
  選択食品に extraNutrients が無ければ `extras` は付けない。
- 編集時も選択中の食品の現在値から再計算する(既存の kcal 等と同じ挙動)。

### render.js(今日の記録)

- `renderGoalSummary` に extras 合計(`sumExtras` の結果)を渡し、塩分の行の直下に
  1行ずつ「DHA 850mg」形式で表示する。進捗バー・目標値なし。
  合計が空(その日の記録に固有栄養素が1つも無い)なら何も表示しない。

### app.js

- `refreshDashboard` で `sumExtras(meals)` を計算して `renderGoalSummary` に渡す。

### style.css

- extras 表示行の最小限のスタイル(既存 goal-row に合わせた控えめな行)。

### sw.js

- `CACHE_NAME` を1つ上げる(並行作業とマージする場合は番号を揃える)。

## スコープ外(YAGNI)

- 各食事アイテム行(row2)への固有栄養素表示
- 分析タブでの固有栄養素の集計・グラフ
- 写真認識(photoRecognition)での固有栄養素の推定
- 固有栄養素の目標値設定
- 単位換算(mg⇔gの自動変換)

写真認識で保存された食事は extras を持たないだけで、合計表示とは問題なく共存する。

## テスト

`tests/nutrition.test.js` に追加:

- `calcExtrasForAmount`: 100g基準の比例計算と丸め。0g・空配列の扱い。
- `sumExtras`: 名前ごとの合算、extras無し食事との混在、空のとき空配列、
  五十音順の並び、丸め誤差(0.1+0.2系)の処理。

## 並行作業との関係

写真認識機能はmasterにマージ済み。本作業は専用ブランチ(worktree)で行い、
衝突しうるのは `sw.js` の `CACHE_NAME` のみ。マージ時に番号を揃える。
