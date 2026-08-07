# 毎日のカロリー計算アプリ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ローカル食品データベースを使って食事のカロリー・PFC・塩分を記録・計算し、1日の栄養目標に対する進捗を表示するPWAを作る。

**Architecture:** ビルド不要の静的PWA(素のHTML/CSS/JavaScript、ESモジュール)。データはブラウザのIndexedDBにのみ保存し、外部通信は行わない。文部科学省日本食品標準成分表を元にした食品データ(`data/foods.json`)を初回起動時にIndexedDBへ流し込み、グラム数入力から比例計算で栄養価を算出する。

**Tech Stack:** Vanilla JavaScript (ES Modules) / HTML / CSS / IndexedDB / Node.js標準テストランナー(`node:test`, 単体テストのみ)

## Global Constraints

- ビルドツール・npm依存パッケージを一切使わない。素のHTML/CSS/JavaScript(ESモジュール)のみで完結させる。
- 外部通信は一切行わない。`fetch`は同一オリジンの`data/foods.json`読み込みのみに使う。
- UI文言はすべて日本語。
- 栄養価はすべて「食品100gあたり」を基準にデータ保持し、入力グラム数から比例計算する。
- ダッシュボードで追跡する栄養項目は カロリー・タンパク質・脂質・糖質・塩分 の5項目のみ(水分・野菜・果物・AI推定・AIカメラ・グラフ・クラウド同期・家族管理は対象外)。
- 単体テストはNode.js標準の`node:test` + `node:assert/strict`のみを使用し、外部テストランナーやアサーションライブラリは追加しない。
- リポジトリは `Git/カロリー計算アプリ/` (git初期化済み)。

---

## 参考: 完成後のディレクトリ構成

```
Git/カロリー計算アプリ/
  package.json
  index.html
  style.css
  manifest.json
  sw.js
  icons/icon.svg
  data/foods.json
  js/
    db.js
    nutrition.js
    foodSearch.js
    render.js
    mealForm.js
    foodForm.js
    settings.js
    app.js
  tests/
    nutrition.test.js
    foodSearch.test.js
  docs/superpowers/specs/2026-08-07-calorie-app-design.md
  docs/superpowers/plans/2026-08-07-calorie-app-plan.md
```

---

### Task 1: プロジェクト雛形・ビジュアルデザイン・PWA基盤

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `style.css`
- Create: `manifest.json`
- Create: `sw.js`
- Create: `icons/icon.svg`
- Create: `js/app.js` (このタスクではスタブのみ)

**Interfaces:**
- Consumes: なし(最初のタスク)
- Produces: `.view` / `.hidden` / `.nav-btn` / `.goal-summary` / `.meal-section` / `.modal-overlay` などのCSSクラス名。`#view-dashboard` `#view-foods` `#view-settings` `#goal-summary` `#meal-breakfast` `#meal-lunch` `#meal-dinner` `#meal-snack` `#current-date` `#prev-day` `#next-day` `#modal-root` の各id。以降のタスクはこれらのidとクラス名に依存する。

- [ ] **Step 1: package.jsonを作成する**

```json
{
  "name": "calorie-app",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "毎日の食事カロリーを記録・計算するローカル完結PWA"
}
```

- [ ] **Step 2: frontend-designスキルを呼び、配色・タイポグラフィの方向性を決める**

`frontend-design` スキルを呼び出し、「食事記録・栄養管理アプリ」向けの配色(プライマリカラー・背景色・文字色)とフォント方針を相談する。下記Step 4のCSS変数(`--color-primary`等)は暫定値なので、スキルの提案に応じて値を更新する。方向性が大きく変わる場合(ダークテーマ基調にする等)は、Step 4のCSS全体をその方向性に合わせて調整してよい。

- [ ] **Step 3: icons/icon.svgを作成する**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="20" fill="#2f6f4f"/>
  <circle cx="38" cy="50" r="18" fill="none" stroke="#ffffff" stroke-width="6"/>
  <line x1="68" y1="28" x2="68" y2="72" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>
  <line x1="60" y1="28" x2="60" y2="46" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>
  <line x1="76" y1="28" x2="76" y2="46" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 4: manifest.jsonを作成する**

```json
{
  "name": "カロリー計算",
  "short_name": "カロリー計算",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2f6f4f",
  "icons": [
    { "src": "icons/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" }
  ]
}
```

- [ ] **Step 5: index.htmlを作成する**

```html
<!doctype html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>カロリー計算</title>
<link rel="manifest" href="manifest.json">
<link rel="stylesheet" href="style.css">
</head>
<body>
<header class="app-header">
  <h1>カロリー計算</h1>
  <nav class="app-nav">
    <button data-view="dashboard" class="nav-btn is-active">今日の記録</button>
    <button data-view="foods" class="nav-btn">食品管理</button>
    <button data-view="settings" class="nav-btn">設定</button>
  </nav>
</header>

<main id="view-dashboard" class="view">
  <div class="date-nav">
    <button id="prev-day">← 前日</button>
    <span id="current-date"></span>
    <button id="next-day">翌日 →</button>
  </div>
  <section id="goal-summary" class="goal-summary"></section>
  <section id="meal-breakfast" class="meal-section" data-meal-type="breakfast"></section>
  <section id="meal-lunch" class="meal-section" data-meal-type="lunch"></section>
  <section id="meal-dinner" class="meal-section" data-meal-type="dinner"></section>
  <section id="meal-snack" class="meal-section" data-meal-type="snack"></section>
</main>

<main id="view-foods" class="view hidden"></main>

<main id="view-settings" class="view hidden"></main>

<div id="modal-root"></div>

<script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 6: style.cssを作成する**

```css
:root {
  --color-bg: #f7f5f0;
  --color-surface: #ffffff;
  --color-primary: #2f6f4f;
  --color-primary-dark: #1f4d36;
  --color-text: #2a2a2a;
  --color-text-muted: #6b6b6b;
  --color-border: #e2e0da;
  --color-danger: #b3452c;
  --radius-md: 12px;
  --radius-sm: 8px;
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --font-family: "Hiragino Sans", "Yu Gothic", sans-serif;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: var(--font-family);
  background: var(--color-bg);
  color: var(--color-text);
}

.hidden { display: none !important; }

.app-header {
  padding: var(--spacing-md);
  background: var(--color-primary);
  color: #fff;
}

.app-header h1 {
  margin: 0 0 var(--spacing-sm) 0;
  font-size: 1.25rem;
}

.app-nav {
  display: flex;
  gap: var(--spacing-sm);
}

.nav-btn {
  flex: 1;
  padding: var(--spacing-sm);
  border: none;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 0.9rem;
}

.nav-btn.is-active {
  background: #fff;
  color: var(--color-primary);
  font-weight: bold;
}

.view {
  padding: var(--spacing-md);
  max-width: 480px;
  margin: 0 auto;
}

.date-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-md);
}

.date-nav button {
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}

.goal-summary {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.goal-row { margin-bottom: var(--spacing-sm); }

.goal-row-label {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  margin-bottom: var(--spacing-xs);
}

.progress-bar {
  height: 8px;
  background: var(--color-border);
  border-radius: 4px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: var(--color-primary);
}

.meal-section {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.meal-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-sm);
}

.add-meal-btn {
  border: none;
  background: var(--color-primary);
  color: #fff;
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
}

.meal-list { list-style: none; margin: 0; padding: 0; }

.meal-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-xs) 0;
  border-bottom: 1px solid var(--color-border);
}

.meal-item-delete {
  border: none;
  background: none;
  color: var(--color-danger);
  font-size: 0.8rem;
}

.meal-empty {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 10;
}

.modal {
  background: var(--color-surface);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  padding: var(--spacing-lg);
  width: 100%;
  max-width: 480px;
  max-height: 85vh;
  overflow-y: auto;
}

.modal label {
  display: block;
  margin-bottom: var(--spacing-sm);
  font-size: 0.9rem;
}

.modal input {
  width: 100%;
  padding: var(--spacing-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  margin-top: var(--spacing-xs);
}

.food-results {
  list-style: none;
  margin: 0 0 var(--spacing-sm) 0;
  padding: 0;
  max-height: 160px;
  overflow-y: auto;
}

.food-results li {
  padding: var(--spacing-sm);
  border-bottom: 1px solid var(--color-border);
}

.meal-preview {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  margin: var(--spacing-sm) 0;
}

.modal-actions {
  display: flex;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
}

.modal-actions button,
.food-form-actions button {
  flex: 1;
  padding: var(--spacing-sm);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
}

#meal-save {
  background: var(--color-primary);
  color: #fff;
  border: none;
}

.food-form,
.goals-form {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.food-form label,
.goals-form label {
  display: block;
  margin-bottom: var(--spacing-sm);
  font-size: 0.9rem;
}

.food-form input,
.goals-form input {
  width: 100%;
  padding: var(--spacing-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  margin-top: var(--spacing-xs);
}

.food-list { list-style: none; margin: 0; padding: 0; }

.food-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-sm) 0;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.9rem;
}
```

- [ ] **Step 7: sw.jsを作成する**

```js
const CACHE_NAME = 'calorie-app-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './data/foods.json',
  './js/app.js',
  './js/db.js',
  './js/nutrition.js',
  './js/foodSearch.js',
  './js/render.js',
  './js/mealForm.js',
  './js/foodForm.js',
  './js/settings.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
```

- [ ] **Step 8: js/app.jsをスタブとして作成する(後続タスクで置き換える)**

```js
console.log('calorie-app: scaffold ready');
```

- [ ] **Step 9: ブラウザで見た目を確認する**

`index.html` をローカルサーバー経由でブラウザに開き(例: プロジェクトルートで簡易HTTPサーバーを起動)、以下を確認する:
- ヘッダー・3つのナビゲーションボタン・日付ナビゲーション・栄養目標エリア(空)・朝食/昼食/夕食/間食のセクションが表示される
- コンソールに `calorie-app: scaffold ready` が出力され、404等の予期しないエラーが出ていない
- `sw.js` が登録エラーになっていない(まだ`navigator.serviceWorker.register`を呼んでいないので登録自体は行われない。これは正常)

- [ ] **Step 10: コミットする**

```bash
git add package.json index.html style.css manifest.json sw.js icons/icon.svg js/app.js
git commit -m "feat: PWAの雛形とビジュアルデザインの土台を作成"
```

---

### Task 2: 食品データベース(data/foods.json)

**Files:**
- Create: `data/foods.json`

**Interfaces:**
- Consumes: なし
- Produces: `foods.json` は `{id, name, category, per100g: {kcal, protein, fat, carb, salt}, source}` の配列。以降のタスク(db.jsのシード処理、foodSearch.js、mealForm.js)がこの構造に依存する。

- [ ] **Step 1: 文部科学省 日本食品標準成分表を元に、よく使う食品を抜粋してdata/foods.jsonを作成する**

```json
[
  { "id": "rice_cooked", "name": "白米(めし)", "category": "主食", "per100g": { "kcal": 156, "protein": 2.5, "fat": 0.3, "carb": 37.1, "salt": 0 }, "source": "mext" },
  { "id": "rice_brown_cooked", "name": "玄米ごはん", "category": "主食", "per100g": { "kcal": 152, "protein": 2.8, "fat": 1.0, "carb": 35.6, "salt": 0 }, "source": "mext" },
  { "id": "bread", "name": "食パン", "category": "主食", "per100g": { "kcal": 248, "protein": 9.3, "fat": 4.4, "carb": 46.7, "salt": 1.3 }, "source": "mext" },
  { "id": "udon_boiled", "name": "うどん(ゆで)", "category": "主食", "per100g": { "kcal": 95, "protein": 2.6, "fat": 0.4, "carb": 21.6, "salt": 0.3 }, "source": "mext" },
  { "id": "soba_boiled", "name": "そば(ゆで)", "category": "主食", "per100g": { "kcal": 130, "protein": 4.8, "fat": 1.0, "carb": 26.0, "salt": 0 }, "source": "mext" },
  { "id": "spaghetti_boiled", "name": "スパゲティ(ゆで)", "category": "主食", "per100g": { "kcal": 150, "protein": 5.2, "fat": 0.9, "carb": 28.4, "salt": 1.2 }, "source": "mext" },
  { "id": "mochi", "name": "もち", "category": "主食", "per100g": { "kcal": 223, "protein": 4.0, "fat": 0.6, "carb": 50.3, "salt": 0 }, "source": "mext" },
  { "id": "chicken_breast_skinless", "name": "鶏むね肉(皮なし)", "category": "主菜", "per100g": { "kcal": 116, "protein": 23.3, "fat": 1.9, "carb": 0.1, "salt": 0.1 }, "source": "mext" },
  { "id": "chicken_thigh_skin", "name": "鶏もも肉(皮つき)", "category": "主菜", "per100g": { "kcal": 200, "protein": 16.6, "fat": 14.0, "carb": 0, "salt": 0.2 }, "source": "mext" },
  { "id": "chicken_tenderloin", "name": "鶏ささみ", "category": "主菜", "per100g": { "kcal": 105, "protein": 23.0, "fat": 0.8, "carb": 0.1, "salt": 0.1 }, "source": "mext" },
  { "id": "pork_loin", "name": "豚ロース(脂身つき)", "category": "主菜", "per100g": { "kcal": 263, "protein": 19.3, "fat": 19.2, "carb": 0.2, "salt": 0.1 }, "source": "mext" },
  { "id": "pork_belly", "name": "豚バラ肉", "category": "主菜", "per100g": { "kcal": 386, "protein": 14.2, "fat": 34.6, "carb": 0.1, "salt": 0.1 }, "source": "mext" },
  { "id": "beef_round_lean", "name": "牛もも肉(赤身)", "category": "主菜", "per100g": { "kcal": 196, "protein": 21.3, "fat": 13.3, "carb": 0.5, "salt": 0.1 }, "source": "mext" },
  { "id": "beef_belly", "name": "牛バラ肉", "category": "主菜", "per100g": { "kcal": 381, "protein": 14.4, "fat": 33.4, "carb": 0.2, "salt": 0.1 }, "source": "mext" },
  { "id": "ground_meat_mixed", "name": "ひき肉(合いびき)", "category": "主菜", "per100g": { "kcal": 251, "protein": 17.2, "fat": 19.8, "carb": 0.4, "salt": 0.1 }, "source": "mext" },
  { "id": "sausage", "name": "ウインナー", "category": "主菜", "per100g": { "kcal": 321, "protein": 11.5, "fat": 30.6, "carb": 3.3, "salt": 1.9 }, "source": "mext" },
  { "id": "bacon", "name": "ベーコン", "category": "主菜", "per100g": { "kcal": 400, "protein": 12.9, "fat": 39.1, "carb": 0.3, "salt": 2.0 }, "source": "mext" },
  { "id": "egg", "name": "卵(全卵)", "category": "主菜", "per100g": { "kcal": 151, "protein": 12.3, "fat": 10.3, "carb": 0.3, "salt": 0.4 }, "source": "mext" },
  { "id": "salmon", "name": "鮭(生)", "category": "主菜", "per100g": { "kcal": 133, "protein": 22.3, "fat": 4.1, "carb": 0.1, "salt": 0.2 }, "source": "mext" },
  { "id": "mackerel", "name": "さば", "category": "主菜", "per100g": { "kcal": 211, "protein": 20.6, "fat": 16.8, "carb": 0.3, "salt": 0.3 }, "source": "mext" },
  { "id": "tuna_lean", "name": "まぐろ(赤身)", "category": "主菜", "per100g": { "kcal": 125, "protein": 26.4, "fat": 1.4, "carb": 0.1, "salt": 0.1 }, "source": "mext" },
  { "id": "shrimp", "name": "えび", "category": "主菜", "per100g": { "kcal": 82, "protein": 18.4, "fat": 0.3, "carb": 0.1, "salt": 0.4 }, "source": "mext" },
  { "id": "horse_mackerel", "name": "あじ", "category": "主菜", "per100g": { "kcal": 126, "protein": 19.7, "fat": 4.5, "carb": 0.1, "salt": 0.3 }, "source": "mext" },
  { "id": "sardine", "name": "いわし", "category": "主菜", "per100g": { "kcal": 169, "protein": 19.8, "fat": 9.2, "carb": 0.2, "salt": 0.2 }, "source": "mext" },
  { "id": "tofu_firm", "name": "豆腐(木綿)", "category": "主菜", "per100g": { "kcal": 72, "protein": 6.6, "fat": 4.2, "carb": 1.6, "salt": 0 }, "source": "mext" },
  { "id": "tofu_silken", "name": "豆腐(絹ごし)", "category": "主菜", "per100g": { "kcal": 56, "protein": 4.9, "fat": 3.0, "carb": 2.0, "salt": 0 }, "source": "mext" },
  { "id": "natto", "name": "納豆", "category": "主菜", "per100g": { "kcal": 190, "protein": 16.5, "fat": 10.0, "carb": 12.1, "salt": 0 }, "source": "mext" },
  { "id": "milk", "name": "牛乳", "category": "乳製品", "per100g": { "kcal": 61, "protein": 3.0, "fat": 3.5, "carb": 4.7, "salt": 0.1 }, "source": "mext" },
  { "id": "yogurt_plain", "name": "ヨーグルト(無糖)", "category": "乳製品", "per100g": { "kcal": 56, "protein": 3.6, "fat": 3.0, "carb": 4.9, "salt": 0.1 }, "source": "mext" },
  { "id": "cheese_processed", "name": "プロセスチーズ", "category": "乳製品", "per100g": { "kcal": 339, "protein": 21.6, "fat": 24.7, "carb": 1.3, "salt": 2.8 }, "source": "mext" },
  { "id": "butter", "name": "バター", "category": "乳製品", "per100g": { "kcal": 700, "protein": 0.6, "fat": 78.0, "carb": 0.2, "salt": 1.5 }, "source": "mext" },
  { "id": "cabbage", "name": "キャベツ", "category": "野菜", "per100g": { "kcal": 21, "protein": 1.3, "fat": 0.2, "carb": 4.6, "salt": 0 }, "source": "mext" },
  { "id": "lettuce", "name": "レタス", "category": "野菜", "per100g": { "kcal": 11, "protein": 0.6, "fat": 0.1, "carb": 1.9, "salt": 0 }, "source": "mext" },
  { "id": "tomato", "name": "トマト", "category": "野菜", "per100g": { "kcal": 19, "protein": 0.7, "fat": 0.1, "carb": 3.9, "salt": 0 }, "source": "mext" },
  { "id": "cucumber", "name": "きゅうり", "category": "野菜", "per100g": { "kcal": 13, "protein": 1.0, "fat": 0.1, "carb": 2.0, "salt": 0 }, "source": "mext" },
  { "id": "carrot", "name": "にんじん", "category": "野菜", "per100g": { "kcal": 35, "protein": 0.6, "fat": 0.1, "carb": 8.5, "salt": 0.1 }, "source": "mext" },
  { "id": "onion", "name": "たまねぎ", "category": "野菜", "per100g": { "kcal": 33, "protein": 0.7, "fat": 0.1, "carb": 7.6, "salt": 0 }, "source": "mext" },
  { "id": "potato", "name": "じゃがいも", "category": "野菜", "per100g": { "kcal": 59, "protein": 1.3, "fat": 0.1, "carb": 14.7, "salt": 0 }, "source": "mext" },
  { "id": "sweet_potato", "name": "さつまいも", "category": "野菜", "per100g": { "kcal": 126, "protein": 0.9, "fat": 0.5, "carb": 29.2, "salt": 0 }, "source": "mext" },
  { "id": "spinach", "name": "ほうれん草", "category": "野菜", "per100g": { "kcal": 18, "protein": 2.2, "fat": 0.4, "carb": 2.8, "salt": 0 }, "source": "mext" },
  { "id": "broccoli", "name": "ブロッコリー", "category": "野菜", "per100g": { "kcal": 33, "protein": 4.3, "fat": 0.5, "carb": 4.3, "salt": 0 }, "source": "mext" },
  { "id": "eggplant", "name": "なす", "category": "野菜", "per100g": { "kcal": 18, "protein": 0.7, "fat": 0.1, "carb": 4.5, "salt": 0 }, "source": "mext" },
  { "id": "bell_pepper", "name": "ピーマン", "category": "野菜", "per100g": { "kcal": 20, "protein": 0.7, "fat": 0.2, "carb": 4.9, "salt": 0 }, "source": "mext" },
  { "id": "bean_sprouts", "name": "もやし", "category": "野菜", "per100g": { "kcal": 14, "protein": 1.7, "fat": 0.1, "carb": 2.3, "salt": 0 }, "source": "mext" },
  { "id": "daikon", "name": "大根", "category": "野菜", "per100g": { "kcal": 15, "protein": 0.4, "fat": 0.1, "carb": 3.4, "salt": 0 }, "source": "mext" },
  { "id": "pumpkin", "name": "かぼちゃ", "category": "野菜", "per100g": { "kcal": 78, "protein": 1.6, "fat": 0.1, "carb": 17.1, "salt": 0 }, "source": "mext" },
  { "id": "shimeji", "name": "しめじ", "category": "野菜", "per100g": { "kcal": 18, "protein": 2.5, "fat": 0.4, "carb": 4.6, "salt": 0 }, "source": "mext" },
  { "id": "apple", "name": "りんご", "category": "果物", "per100g": { "kcal": 53, "protein": 0.1, "fat": 0.1, "carb": 14.1, "salt": 0 }, "source": "mext" },
  { "id": "banana", "name": "バナナ", "category": "果物", "per100g": { "kcal": 86, "protein": 1.1, "fat": 0.2, "carb": 21.4, "salt": 0 }, "source": "mext" },
  { "id": "mandarin", "name": "みかん", "category": "果物", "per100g": { "kcal": 45, "protein": 0.6, "fat": 0.1, "carb": 11.0, "salt": 0 }, "source": "mext" },
  { "id": "strawberry", "name": "いちご", "category": "果物", "per100g": { "kcal": 31, "protein": 0.7, "fat": 0.1, "carb": 7.1, "salt": 0 }, "source": "mext" },
  { "id": "grape", "name": "ぶどう", "category": "果物", "per100g": { "kcal": 58, "protein": 0.3, "fat": 0.1, "carb": 15.2, "salt": 0 }, "source": "mext" },
  { "id": "soy_sauce", "name": "醤油", "category": "調味料", "per100g": { "kcal": 71, "protein": 7.7, "fat": 0, "carb": 7.9, "salt": 14.5 }, "source": "mext" },
  { "id": "miso", "name": "みそ", "category": "調味料", "per100g": { "kcal": 192, "protein": 12.5, "fat": 6.0, "carb": 17.0, "salt": 12.4 }, "source": "mext" },
  { "id": "mayonnaise", "name": "マヨネーズ", "category": "調味料", "per100g": { "kcal": 703, "protein": 1.4, "fat": 75.3, "carb": 2.1, "salt": 1.9 }, "source": "mext" },
  { "id": "ketchup", "name": "ケチャップ", "category": "調味料", "per100g": { "kcal": 106, "protein": 1.6, "fat": 0.2, "carb": 25.6, "salt": 3.1 }, "source": "mext" },
  { "id": "sugar", "name": "砂糖", "category": "調味料", "per100g": { "kcal": 384, "protein": 0, "fat": 0, "carb": 99.3, "salt": 0 }, "source": "mext" },
  { "id": "salad_oil", "name": "サラダ油", "category": "調味料", "per100g": { "kcal": 921, "protein": 0, "fat": 100, "carb": 0, "salt": 0 }, "source": "mext" },
  { "id": "margarine", "name": "マーガリン", "category": "調味料", "per100g": { "kcal": 715, "protein": 0.4, "fat": 81.6, "carb": 0.5, "salt": 1.3 }, "source": "mext" },
  { "id": "green_tea", "name": "緑茶", "category": "飲料", "per100g": { "kcal": 0, "protein": 0, "fat": 0, "carb": 0.2, "salt": 0 }, "source": "mext" },
  { "id": "coffee_black", "name": "コーヒー(ブラック)", "category": "飲料", "per100g": { "kcal": 4, "protein": 0.2, "fat": 0, "carb": 0.7, "salt": 0 }, "source": "mext" },
  { "id": "orange_juice", "name": "オレンジジュース", "category": "飲料", "per100g": { "kcal": 42, "protein": 0.7, "fat": 0.1, "carb": 9.8, "salt": 0 }, "source": "mext" },
  { "id": "beer", "name": "ビール", "category": "飲料", "per100g": { "kcal": 40, "protein": 0.3, "fat": 0, "carb": 3.1, "salt": 0 }, "source": "mext" }
]
```

- [ ] **Step 2: JSONとして正しくパースできるか確認する**

Run: `node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('data/foods.json','utf8')); console.log('件数:', data.length); console.log('先頭:', data[0]);"`
Expected: エラーなく件数(63件)と先頭の`rice_cooked`のレコードが表示される

- [ ] **Step 3: コミットする**

```bash
git add data/foods.json
git commit -m "feat: 文科省食品標準成分表を元にした食品データベースを追加"
```

---

### Task 3: 栄養計算ロジック(js/nutrition.js) — TDD

**Files:**
- Create: `js/nutrition.js`
- Test: `tests/nutrition.test.js`

**Interfaces:**
- Consumes: なし(pureな計算関数)
- Produces:
  - `calcNutrientsForAmount(per100g: {kcal,protein,fat,carb,salt}, amountGrams: number): {kcal,protein,fat,carb,salt}`
  - `sumNutrients(list: Array<{kcal,protein,fat,carb,salt}>): {kcal,protein,fat,carb,salt}`
  - `calcProgress(currentValue: number, goalValue: number): number` (0以上の整数パーセント。goalValueが0以下なら0を返す)
  - 以降のタスク(render.js, mealForm.js, app.js)がこれら3関数を使用する。

- [ ] **Step 1: 失敗するテストを書く(tests/nutrition.test.js)**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcNutrientsForAmount, sumNutrients, calcProgress } from '../js/nutrition.js';

test('calcNutrientsForAmount: 100gちょうどは per100g の値と同じ', () => {
  const per100g = { kcal: 156, protein: 2.5, fat: 0.3, carb: 37.1, salt: 0 };
  const result = calcNutrientsForAmount(per100g, 100);
  assert.deepEqual(result, { kcal: 156, protein: 2.5, fat: 0.3, carb: 37.1, salt: 0 });
});

test('calcNutrientsForAmount: 150gは1.5倍で計算される', () => {
  const per100g = { kcal: 200, protein: 10, fat: 4, carb: 20, salt: 1 };
  const result = calcNutrientsForAmount(per100g, 150);
  assert.deepEqual(result, { kcal: 300, protein: 15, fat: 6, carb: 30, salt: 1.5 });
});

test('calcNutrientsForAmount: 0gは全て0になる(0除算を含まない)', () => {
  const per100g = { kcal: 200, protein: 10, fat: 4, carb: 20, salt: 1 };
  const result = calcNutrientsForAmount(per100g, 0);
  assert.deepEqual(result, { kcal: 0, protein: 0, fat: 0, carb: 0, salt: 0 });
});

test('sumNutrients: 複数の記録を合計できる', () => {
  const list = [
    { kcal: 100, protein: 5, fat: 2, carb: 10, salt: 0.5 },
    { kcal: 200, protein: 10, fat: 4, carb: 20, salt: 1.0 },
  ];
  assert.deepEqual(sumNutrients(list), { kcal: 300, protein: 15, fat: 6, carb: 30, salt: 1.5 });
});

test('sumNutrients: 空配列は全て0', () => {
  assert.deepEqual(sumNutrients([]), { kcal: 0, protein: 0, fat: 0, carb: 0, salt: 0 });
});

test('calcProgress: 目標の半分なら50%', () => {
  assert.equal(calcProgress(900, 1800), 50);
});

test('calcProgress: 目標が0以下なら0を返す(0除算を防ぐ)', () => {
  assert.equal(calcProgress(500, 0), 0);
  assert.equal(calcProgress(500, -10), 0);
});

test('calcProgress: 目標を超えたら100を超える値を返す', () => {
  assert.equal(calcProgress(2000, 1800), 111);
});
```

- [ ] **Step 2: テストを実行し失敗を確認する**

Run: `node --test tests/nutrition.test.js`
Expected: `js/nutrition.js` が存在しないためモジュール解決エラーでFAILする

- [ ] **Step 3: 最小限の実装を書く(js/nutrition.js)**

```js
export function calcNutrientsForAmount(per100g, amountGrams) {
  const ratio = amountGrams / 100;
  return {
    kcal: Math.round(per100g.kcal * ratio),
    protein: Math.round(per100g.protein * ratio * 10) / 10,
    fat: Math.round(per100g.fat * ratio * 10) / 10,
    carb: Math.round(per100g.carb * ratio * 10) / 10,
    salt: Math.round(per100g.salt * ratio * 10) / 10,
  };
}

export function sumNutrients(list) {
  return list.reduce(
    (total, item) => ({
      kcal: total.kcal + item.kcal,
      protein: Math.round((total.protein + item.protein) * 10) / 10,
      fat: Math.round((total.fat + item.fat) * 10) / 10,
      carb: Math.round((total.carb + item.carb) * 10) / 10,
      salt: Math.round((total.salt + item.salt) * 10) / 10,
    }),
    { kcal: 0, protein: 0, fat: 0, carb: 0, salt: 0 }
  );
}

export function calcProgress(currentValue, goalValue) {
  if (!goalValue || goalValue <= 0) return 0;
  return Math.round((currentValue / goalValue) * 100);
}
```

- [ ] **Step 4: テストを実行し成功を確認する**

Run: `node --test tests/nutrition.test.js`
Expected: 全テストPASS

- [ ] **Step 5: コミットする**

```bash
git add js/nutrition.js tests/nutrition.test.js
git commit -m "feat: 栄養計算ロジック(nutrition.js)をTDDで実装"
```

---

### Task 4: 食品検索ロジック(js/foodSearch.js) — TDD

**Files:**
- Create: `js/foodSearch.js`
- Test: `tests/foodSearch.test.js`

**Interfaces:**
- Consumes: なし(pureな検索関数)
- Produces: `searchFoods(foods: Array<{id,name,...}>, query: string): Array<食品オブジェクト>`(部分一致・大文字小文字を区別しない。queryが空/空白のみの場合は空配列を返す)。以降のタスク(mealForm.js)がこの関数を使用する。

- [ ] **Step 1: 失敗するテストを書く(tests/foodSearch.test.js)**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { searchFoods } from '../js/foodSearch.js';

const foods = [
  { id: 'rice_cooked', name: '白米(めし)' },
  { id: 'bread', name: '食パン' },
  { id: 'udon_boiled', name: 'うどん(ゆで)' },
];

test('searchFoods: 部分一致する食品を返す', () => {
  const result = searchFoods(foods, '白米');
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'rice_cooked');
});

test('searchFoods: 空文字・空白のみは空配列を返す', () => {
  assert.deepEqual(searchFoods(foods, ''), []);
  assert.deepEqual(searchFoods(foods, '   '), []);
});

test('searchFoods: ヒットしない場合は空配列', () => {
  assert.deepEqual(searchFoods(foods, 'ラーメン'), []);
});

test('searchFoods: 複数ヒットする', () => {
  const result = searchFoods(foods, 'ん');
  assert.equal(result.length, 2);
});
```

- [ ] **Step 2: テストを実行し失敗を確認する**

Run: `node --test tests/foodSearch.test.js`
Expected: `js/foodSearch.js` が存在しないためモジュール解決エラーでFAILする

- [ ] **Step 3: 最小限の実装を書く(js/foodSearch.js)**

```js
export function searchFoods(foods, query) {
  const trimmed = query.trim();
  if (trimmed === '') return [];
  const lower = trimmed.toLowerCase();
  return foods.filter((food) => food.name.toLowerCase().includes(lower));
}
```

- [ ] **Step 4: テストを実行し成功を確認する**

Run: `node --test tests/foodSearch.test.js`
Expected: 全テストPASS

- [ ] **Step 5: コミットする**

```bash
git add js/foodSearch.js tests/foodSearch.test.js
git commit -m "feat: 食品検索ロジック(foodSearch.js)をTDDで実装"
```

---

### Task 5: IndexedDBラッパー(js/db.js)

**Files:**
- Create: `js/db.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `openDB(): Promise<IDBDatabase>`
  - `seedFoodsIfEmpty(db, seedFoods: Array): Promise<void>`
  - `getAllFoods(db): Promise<Array>`
  - `addFood(db, food): Promise<string>` (生成したidを返す)
  - `updateFood(db, food): Promise<void>`
  - `deleteFood(db, id): Promise<void>`
  - `getMealsByDate(db, date: string): Promise<Array>`
  - `addMeal(db, meal): Promise<number>` (自動採番されたidを返す)
  - `deleteMeal(db, id: number): Promise<void>`
  - `getGoals(db): Promise<{kcal,protein,fat,carb,salt}>`
  - `saveGoals(db, goals): Promise<void>`
  - 以降のタスク(app.js, mealForm.js, foodForm.js, settings.js)がこれらを使用する。IndexedDBはブラウザAPIのため、このタスクの検証はブラウザ上で行う(Node単体テストは対象外、設計書のテスト方針どおり)。

- [ ] **Step 1: js/db.jsを実装する**

```js
const DB_NAME = 'calorie-app-db';
const DB_VERSION = 1;

export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('foods')) {
        db.createObjectStore('foods', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meals')) {
        const mealsStore = db.createObjectStore('meals', { keyPath: 'id', autoIncrement: true });
        mealsStore.createIndex('by_date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains('goals')) {
        db.createObjectStore('goals', { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function seedFoodsIfEmpty(db, seedFoods) {
  const existing = await getAllFoods(db);
  if (existing.length > 0) return;
  const tx = db.transaction('foods', 'readwrite');
  const store = tx.objectStore('foods');
  for (const food of seedFoods) {
    store.put(food);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllFoods(db) {
  const tx = db.transaction('foods', 'readonly');
  const store = tx.objectStore('foods');
  return promisifyRequest(store.getAll());
}

export async function addFood(db, food) {
  const tx = db.transaction('foods', 'readwrite');
  const store = tx.objectStore('foods');
  const id = food.id || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const record = { ...food, id, source: food.source || 'custom' };
  store.put(record);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateFood(db, food) {
  const tx = db.transaction('foods', 'readwrite');
  tx.objectStore('foods').put(food);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteFood(db, id) {
  const tx = db.transaction('foods', 'readwrite');
  tx.objectStore('foods').delete(id);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMealsByDate(db, date) {
  const tx = db.transaction('meals', 'readonly');
  const store = tx.objectStore('meals');
  const index = store.index('by_date');
  return promisifyRequest(index.getAll(date));
}

export async function addMeal(db, meal) {
  const tx = db.transaction('meals', 'readwrite');
  const request = tx.objectStore('meals').add(meal);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteMeal(db, id) {
  const tx = db.transaction('meals', 'readwrite');
  tx.objectStore('meals').delete(id);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const DEFAULT_GOALS = { id: 'default', kcal: 2000, protein: 60, fat: 60, carb: 250, salt: 7.0 };

export async function getGoals(db) {
  const tx = db.transaction('goals', 'readonly');
  const result = await promisifyRequest(tx.objectStore('goals').get('default'));
  return result || DEFAULT_GOALS;
}

export async function saveGoals(db, goals) {
  const tx = db.transaction('goals', 'readwrite');
  tx.objectStore('goals').put({ ...goals, id: 'default' });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
```

- [ ] **Step 2: ブラウザで動作確認する**

`index.html` をブラウザで開き、devtoolsコンソールで以下を実行する:

```js
const { openDB, addFood, getAllFoods, addMeal, getMealsByDate, getGoals, saveGoals } = await import('./js/db.js');
const db = await openDB();
await addFood(db, { name: 'テスト食品', per100g: { kcal: 100, protein: 1, fat: 1, carb: 1, salt: 1 } });
console.log(await getAllFoods(db)); // テスト食品が含まれる配列が出力される
await addMeal(db, { date: '2026-08-07', mealType: 'breakfast', foodId: 'custom_test', amountGrams: 100, kcal: 100, protein: 1, fat: 1, carb: 1, salt: 1 });
console.log(await getMealsByDate(db, '2026-08-07')); // 追加した記録が1件出力される
console.log(await getGoals(db)); // デフォルト値 {kcal:2000, protein:60, fat:60, carb:250, salt:7} が出力される
await saveGoals(db, { kcal: 1800, protein: 70, fat: 50, carb: 220, salt: 6.5 });
console.log(await getGoals(db)); // 更新した値が出力される
```

Expected: いずれもエラーなく実行でき、コメントどおりの内容が出力される

- [ ] **Step 3: コミットする**

```bash
git add js/db.js
git commit -m "feat: IndexedDBラッパー(db.js)を実装"
```

---

### Task 6: ダッシュボード表示とアプリ初期化(js/render.js + js/app.js)

**Files:**
- Create: `js/render.js`
- Modify: `js/app.js` (Task 1のスタブを置き換える)

**Interfaces:**
- Consumes: `js/nutrition.js`の`sumNutrients`・`calcProgress`、`js/db.js`の`openDB`・`seedFoodsIfEmpty`・`getAllFoods`・`getMealsByDate`・`getGoals`、`data/foods.json`
- Produces:
  - `renderGoalSummary(container: HTMLElement, totals, goals): void`
  - `renderMealSection(container: HTMLElement, mealType: string, meals: Array, foodsById: object): void`
  - 以降のタスク(mealForm.js, foodForm.js, settings.js)は`js/app.js`内の`state`と`refreshDashboard()`に依存して機能を追加していく。

- [ ] **Step 1: js/render.jsを実装する**

```js
import { calcProgress } from './nutrition.js';

export function renderGoalSummary(container, totals, goals) {
  const rows = [
    { label: 'カロリー', unit: 'kcal', current: totals.kcal, goal: goals.kcal },
    { label: 'タンパク質', unit: 'g', current: totals.protein, goal: goals.protein },
    { label: '脂質', unit: 'g', current: totals.fat, goal: goals.fat },
    { label: '糖質', unit: 'g', current: totals.carb, goal: goals.carb },
    { label: '塩分', unit: 'g', current: totals.salt, goal: goals.salt },
  ];

  container.innerHTML = rows
    .map((row) => {
      const progress = calcProgress(row.current, row.goal);
      const width = Math.min(progress, 100);
      return `
        <div class="goal-row">
          <div class="goal-row-label">
            <span>${row.label}</span>
            <span>${row.current} / ${row.goal}${row.unit}(${progress}%)</span>
          </div>
          <div class="progress-bar">
            <div class="progress-bar-fill" style="width:${width}%"></div>
          </div>
        </div>
      `;
    })
    .join('');
}

const MEAL_TYPE_LABELS = {
  breakfast: '朝食',
  lunch: '昼食',
  dinner: '夕食',
  snack: '間食',
};

export function renderMealSection(container, mealType, meals, foodsById) {
  const label = MEAL_TYPE_LABELS[mealType];
  const itemsHtml = meals.length === 0
    ? '<p class="meal-empty">まだ記録されていません</p>'
    : meals
        .map((meal) => {
          const food = meal.foodId ? foodsById[meal.foodId] : null;
          const name = food ? food.name : (meal.freeText ?? '(削除済み食品)');
          return `
            <li class="meal-item" data-meal-id="${meal.id}">
              <span class="meal-item-name">${name} ${meal.amountGrams}g</span>
              <span class="meal-item-kcal">${meal.kcal}kcal</span>
              <button class="meal-item-delete" data-action="delete-meal" data-meal-id="${meal.id}">削除</button>
            </li>
          `;
        })
        .join('');

  container.innerHTML = `
    <div class="meal-section-header">
      <h2>${label}</h2>
      <button class="add-meal-btn" data-action="add-meal" data-meal-type="${mealType}">＋ 追加</button>
    </div>
    <ul class="meal-list">${itemsHtml}</ul>
  `;
}
```

- [ ] **Step 2: js/app.jsをTask1のスタブから置き換える**

```js
import { openDB, seedFoodsIfEmpty, getAllFoods, getMealsByDate, getGoals } from './db.js';
import { sumNutrients } from './nutrition.js';
import { renderGoalSummary, renderMealSection } from './render.js';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

const state = {
  date: formatDate(new Date()),
  foods: [],
  goals: null,
  db: null,
};

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftDate(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

async function refreshDashboard() {
  document.getElementById('current-date').textContent = state.date;
  const meals = await getMealsByDate(state.db, state.date);
  const foodsById = Object.fromEntries(state.foods.map((f) => [f.id, f]));
  const totals = sumNutrients(meals);

  renderGoalSummary(document.getElementById('goal-summary'), totals, state.goals);

  for (const mealType of MEAL_TYPES) {
    const mealsOfType = meals.filter((m) => m.mealType === mealType);
    renderMealSection(document.getElementById(`meal-${mealType}`), mealType, mealsOfType, foodsById);
  }
}

function bindDateNav() {
  document.getElementById('prev-day').addEventListener('click', () => {
    state.date = shiftDate(state.date, -1);
    refreshDashboard();
  });
  document.getElementById('next-day').addEventListener('click', () => {
    state.date = shiftDate(state.date, 1);
    refreshDashboard();
  });
}

async function init() {
  state.db = await openDB();
  const seedResponse = await fetch('data/foods.json');
  const seedFoods = await seedResponse.json();
  await seedFoodsIfEmpty(state.db, seedFoods);
  state.foods = await getAllFoods(state.db);
  state.goals = await getGoals(state.db);

  bindDateNav();
  await refreshDashboard();
}

init();
```

- [ ] **Step 3: ブラウザで動作確認する**

`index.html`をブラウザで開き、以下を確認する:
- 日付欄に今日の日付が表示される
- 栄養目標エリアに「カロリー 0 / 2000kcal(0%)」など5行の進捗バーが表示される
- 朝食/昼食/夕食/間食の各セクションに「まだ記録されていません」と表示される
- 「← 前日」「翌日 →」を押すと日付表示が変わる
- devtoolsコンソールにエラーが出ていない

- [ ] **Step 4: コミットする**

```bash
git add js/render.js js/app.js
git commit -m "feat: ダッシュボード表示とアプリ初期化を実装"
```

---

### Task 7: 食事記録フォーム(js/mealForm.js)

**Files:**
- Create: `js/mealForm.js`
- Modify: `js/app.js`

**Interfaces:**
- Consumes: `js/foodSearch.js`の`searchFoods`、`js/nutrition.js`の`calcNutrientsForAmount`、`js/db.js`の`addMeal`・`deleteMeal`
- Produces: `openMealForm({modalRoot, db, mealType, date, foods, onSaved, onRegisterNew}): void`。Task 8で`onRegisterNew`の実装を本実装に差し替える。

- [ ] **Step 1: js/mealForm.jsを実装する**

```js
import { searchFoods } from './foodSearch.js';
import { calcNutrientsForAmount } from './nutrition.js';
import { addMeal } from './db.js';

const MEAL_TYPE_LABELS = { breakfast: '朝食', lunch: '昼食', dinner: '夕食', snack: '間食' };

export function openMealForm({ modalRoot, db, mealType, date, foods, onSaved, onRegisterNew }) {
  let selectedFood = null;

  modalRoot.innerHTML = `
    <div class="modal-overlay">
      <div class="modal">
        <h2>${MEAL_TYPE_LABELS[mealType]}に追加</h2>
        <label>食品名
          <input type="text" id="meal-food-query" autocomplete="off" placeholder="例: 白米">
        </label>
        <ul id="meal-food-results" class="food-results"></ul>
        <div id="meal-selected" class="meal-selected hidden">
          <span id="meal-selected-name"></span>
          <label>量(g)
            <input type="number" id="meal-amount" value="100" min="1" step="1">
          </label>
          <div id="meal-preview" class="meal-preview"></div>
        </div>
        <p id="meal-no-result" class="hidden">見つかりません。<button id="meal-register-new" type="button">新しい食品として登録する</button></p>
        <div class="modal-actions">
          <button id="meal-cancel" type="button">キャンセル</button>
          <button id="meal-save" type="button" disabled>保存</button>
        </div>
      </div>
    </div>
  `;

  const queryInput = modalRoot.querySelector('#meal-food-query');
  const resultsList = modalRoot.querySelector('#meal-food-results');
  const selectedBox = modalRoot.querySelector('#meal-selected');
  const selectedName = modalRoot.querySelector('#meal-selected-name');
  const amountInput = modalRoot.querySelector('#meal-amount');
  const previewBox = modalRoot.querySelector('#meal-preview');
  const noResult = modalRoot.querySelector('#meal-no-result');
  const saveBtn = modalRoot.querySelector('#meal-save');
  const cancelBtn = modalRoot.querySelector('#meal-cancel');
  const registerNewBtn = modalRoot.querySelector('#meal-register-new');

  function updatePreview() {
    if (!selectedFood) return;
    const amount = Number(amountInput.value);
    if (!amount || amount <= 0) {
      previewBox.textContent = '';
      saveBtn.disabled = true;
      return;
    }
    const nutrients = calcNutrientsForAmount(selectedFood.per100g, amount);
    previewBox.textContent = `${nutrients.kcal}kcal / P${nutrients.protein}g F${nutrients.fat}g C${nutrients.carb}g 塩分${nutrients.salt}g`;
    saveBtn.disabled = false;
  }

  queryInput.addEventListener('input', () => {
    const query = queryInput.value;
    const results = searchFoods(foods, query);
    noResult.classList.toggle('hidden', results.length > 0 || query.trim() === '');
    resultsList.innerHTML = results
      .map((food) => `<li data-food-id="${food.id}">${food.name}</li>`)
      .join('');
  });

  resultsList.addEventListener('click', (event) => {
    const li = event.target.closest('li[data-food-id]');
    if (!li) return;
    selectedFood = foods.find((f) => f.id === li.dataset.foodId);
    selectedName.textContent = selectedFood.name;
    selectedBox.classList.remove('hidden');
    resultsList.innerHTML = '';
    queryInput.value = selectedFood.name;
    updatePreview();
  });

  amountInput.addEventListener('input', updatePreview);

  registerNewBtn.addEventListener('click', () => {
    const name = queryInput.value.trim();
    closeModal();
    onRegisterNew(name);
  });

  saveBtn.addEventListener('click', async () => {
    if (!selectedFood) return;
    const amount = Number(amountInput.value);
    const nutrients = calcNutrientsForAmount(selectedFood.per100g, amount);
    await addMeal(db, {
      date,
      mealType,
      foodId: selectedFood.id,
      amountGrams: amount,
      ...nutrients,
    });
    closeModal();
    onSaved();
  });

  cancelBtn.addEventListener('click', closeModal);

  function closeModal() {
    modalRoot.innerHTML = '';
  }
}
```

- [ ] **Step 2: js/app.jsを修正し、食事の追加・削除を配線する**

`import { openDB, seedFoodsIfEmpty, getAllFoods, getMealsByDate, getGoals } from './db.js';` の行を次のように置き換える:

```js
import { openDB, seedFoodsIfEmpty, getAllFoods, getMealsByDate, getGoals, deleteMeal } from './db.js';
import { openMealForm } from './mealForm.js';
```

`init()`関数の直前に次の関数を追加する:

```js
function bindMealActions() {
  document.getElementById('view-dashboard').addEventListener('click', async (event) => {
    const addBtn = event.target.closest('[data-action="add-meal"]');
    if (addBtn) {
      openMealForm({
        modalRoot: document.getElementById('modal-root'),
        db: state.db,
        mealType: addBtn.dataset.mealType,
        date: state.date,
        foods: state.foods,
        onSaved: refreshDashboard,
        onRegisterNew: (name) => alert(`「${name}」の登録は「食品管理」画面で行ってください(次のタスクで対応します)`),
      });
      return;
    }
    const deleteBtn = event.target.closest('[data-action="delete-meal"]');
    if (deleteBtn) {
      await deleteMeal(state.db, Number(deleteBtn.dataset.mealId));
      refreshDashboard();
    }
  });
}
```

`init()`関数内、`bindDateNav();`の次の行に`bindMealActions();`を追加する。

- [ ] **Step 3: ブラウザで動作確認する**

`index.html`をブラウザで開き、以下を確認する:
- 朝食セクションの「＋ 追加」をクリックするとモーダルが開く
- 「白米」と入力すると候補に「白米(めし)」が表示される
- 候補を選択し、量を150gに変更するとプレビューに計算結果が表示される(白米150gなら234kcal程度)
- 「保存」を押すとモーダルが閉じ、朝食セクションに記録が追加され、栄養目標の進捗バーが更新される
- 記録の「削除」ボタンを押すと記録が消え、進捗バーが0に戻る

- [ ] **Step 4: コミットする**

```bash
git add js/mealForm.js js/app.js
git commit -m "feat: 食事記録フォーム(mealForm.js)を実装し追加・削除を配線"
```

---

### Task 8: 食品登録・編集画面(js/foodForm.js)

**Files:**
- Create: `js/foodForm.js`
- Modify: `js/app.js`

**Interfaces:**
- Consumes: `js/db.js`の`addFood`・`updateFood`・`deleteFood`
- Produces: `renderFoodsView(container: HTMLElement, db, foods: Array, {prefillName, onChange}): void`

- [ ] **Step 1: js/foodForm.jsを実装する**

```js
import { addFood, updateFood, deleteFood } from './db.js';

export function renderFoodsView(container, db, foods, { prefillName = '', onChange } = {}) {
  container.innerHTML = `
    <h2>食品の登録・編集</h2>
    <form id="food-form" class="food-form">
      <input type="hidden" id="food-id">
      <label>食品名 <input type="text" id="food-name" required></label>
      <label>カロリー(kcal/100g) <input type="number" id="food-kcal" step="0.1" required></label>
      <label>タンパク質(g/100g) <input type="number" id="food-protein" step="0.1" required></label>
      <label>脂質(g/100g) <input type="number" id="food-fat" step="0.1" required></label>
      <label>糖質(g/100g) <input type="number" id="food-carb" step="0.1" required></label>
      <label>塩分(g/100g) <input type="number" id="food-salt" step="0.1" required></label>
      <div class="food-form-actions">
        <button type="submit">保存</button>
        <button type="button" id="food-form-reset">クリア</button>
      </div>
    </form>
    <ul id="food-list" class="food-list"></ul>
  `;

  const form = container.querySelector('#food-form');
  const idInput = container.querySelector('#food-id');
  const nameInput = container.querySelector('#food-name');
  const kcalInput = container.querySelector('#food-kcal');
  const proteinInput = container.querySelector('#food-protein');
  const fatInput = container.querySelector('#food-fat');
  const carbInput = container.querySelector('#food-carb');
  const saltInput = container.querySelector('#food-salt');
  const list = container.querySelector('#food-list');
  const resetBtn = container.querySelector('#food-form-reset');

  function resetForm() {
    form.reset();
    idInput.value = '';
  }

  function fillForm(food) {
    idInput.value = food.id;
    nameInput.value = food.name;
    kcalInput.value = food.per100g.kcal;
    proteinInput.value = food.per100g.protein;
    fatInput.value = food.per100g.fat;
    carbInput.value = food.per100g.carb;
    saltInput.value = food.per100g.salt;
    nameInput.focus();
  }

  function renderList() {
    const sorted = [...foods].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    list.innerHTML = sorted
      .map(
        (food) => `
        <li data-food-id="${food.id}">
          <span>${food.name}(${food.per100g.kcal}kcal/100g)</span>
          <button type="button" data-action="edit" data-food-id="${food.id}">編集</button>
          <button type="button" data-action="delete" data-food-id="${food.id}">削除</button>
        </li>`
      )
      .join('');
  }

  list.addEventListener('click', async (event) => {
    const btn = event.target.closest('button[data-action]');
    if (!btn) return;
    const foodId = btn.dataset.foodId;
    const food = foods.find((f) => f.id === foodId);
    if (btn.dataset.action === 'edit') {
      fillForm(food);
    } else if (btn.dataset.action === 'delete') {
      if (!confirm(`「${food.name}」を削除しますか？`)) return;
      await deleteFood(db, foodId);
      const index = foods.findIndex((f) => f.id === foodId);
      foods.splice(index, 1);
      renderList();
      onChange?.();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const per100g = {
      kcal: Number(kcalInput.value),
      protein: Number(proteinInput.value),
      fat: Number(fatInput.value),
      carb: Number(carbInput.value),
      salt: Number(saltInput.value),
    };
    if (idInput.value) {
      const existing = foods.find((f) => f.id === idInput.value);
      const updated = { ...existing, name: nameInput.value, per100g };
      await updateFood(db, updated);
      Object.assign(existing, updated);
    } else {
      const id = await addFood(db, { name: nameInput.value, per100g, category: '未分類', source: 'custom' });
      foods.push({ id, name: nameInput.value, per100g, category: '未分類', source: 'custom' });
    }
    resetForm();
    renderList();
    onChange?.();
  });

  resetBtn.addEventListener('click', resetForm);

  if (prefillName) {
    nameInput.value = prefillName;
    nameInput.focus();
  }

  renderList();
}
```

- [ ] **Step 2: js/app.jsを修正し、食品管理画面への切り替えを配線する**

`import { openMealForm } from './mealForm.js';` の次の行に追加する:

```js
import { renderFoodsView } from './foodForm.js';
```

`bindMealActions`関数の直前に以下を追加する:

```js
function switchView(viewName) {
  for (const view of document.querySelectorAll('.view')) {
    view.classList.toggle('hidden', view.id !== `view-${viewName}`);
  }
  for (const btn of document.querySelectorAll('.nav-btn')) {
    btn.classList.toggle('is-active', btn.dataset.view === viewName);
  }
}

function openFoodsView(prefillName = '') {
  switchView('foods');
  renderFoodsView(document.getElementById('view-foods'), state.db, state.foods, {
    prefillName,
    onChange: refreshDashboard,
  });
}

function bindNav() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (view === 'foods') {
        openFoodsView();
      } else {
        switchView(view);
      }
    });
  });
}
```

`bindMealActions`関数内の`onRegisterNew`を次のように置き換える:

```js
        onRegisterNew: (name) => openFoodsView(name),
```

`init()`関数内、`bindMealActions();`の次の行に`bindNav();`を追加する。

- [ ] **Step 3: ブラウザで動作確認する**

`index.html`をブラウザで開き、以下を確認する:
- 上部ナビゲーションの「食品管理」を押すと画面が切り替わり、63件の食品(Task2で登録したもの)が一覧表示される
- 新しい食品(例:「手作りカレー」kcal180等)を登録すると一覧に追加される
- 一覧の「編集」を押すとフォームに値が入り、変更して保存すると一覧が更新される
- 「削除」を押すと確認ダイアログの後、一覧から消える
- ダッシュボードで食品検索してヒットしない名前を入力し「新しい食品として登録する」を押すと、食品管理画面に切り替わりその名前が入力欄に入っている

- [ ] **Step 4: コミットする**

```bash
git add js/foodForm.js js/app.js
git commit -m "feat: 食品登録・編集画面(foodForm.js)を実装し画面切り替えを配線"
```

---

### Task 9: 設定画面(js/settings.js)・Service Worker登録・最終配線

**Files:**
- Create: `js/settings.js`
- Modify: `js/app.js`

**Interfaces:**
- Consumes: `js/db.js`の`saveGoals`
- Produces: `renderSettingsView(container: HTMLElement, db, goals, {onSaved}): void`

- [ ] **Step 1: js/settings.jsを実装する**

```js
import { saveGoals } from './db.js';

export function renderSettingsView(container, db, goals, { onSaved } = {}) {
  container.innerHTML = `
    <h2>栄養目標の設定</h2>
    <form id="goals-form" class="goals-form">
      <label>カロリー(kcal) <input type="number" id="goal-kcal" value="${goals.kcal}" min="0" step="1"></label>
      <label>タンパク質(g) <input type="number" id="goal-protein" value="${goals.protein}" min="0" step="0.1"></label>
      <label>脂質(g) <input type="number" id="goal-fat" value="${goals.fat}" min="0" step="0.1"></label>
      <label>糖質(g) <input type="number" id="goal-carb" value="${goals.carb}" min="0" step="0.1"></label>
      <label>塩分(g) <input type="number" id="goal-salt" value="${goals.salt}" min="0" step="0.1"></label>
      <button type="submit">保存</button>
      <span id="goals-saved-msg" class="hidden">保存しました</span>
    </form>
  `;

  const form = container.querySelector('#goals-form');
  const savedMsg = container.querySelector('#goals-saved-msg');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const newGoals = {
      kcal: Number(container.querySelector('#goal-kcal').value),
      protein: Number(container.querySelector('#goal-protein').value),
      fat: Number(container.querySelector('#goal-fat').value),
      carb: Number(container.querySelector('#goal-carb').value),
      salt: Number(container.querySelector('#goal-salt').value),
    };
    await saveGoals(db, newGoals);
    Object.assign(goals, newGoals);
    savedMsg.classList.remove('hidden');
    setTimeout(() => savedMsg.classList.add('hidden'), 2000);
    onSaved?.();
  });
}
```

- [ ] **Step 2: js/app.jsを修正し、設定画面とService Worker登録を配線する**

`import { renderFoodsView } from './foodForm.js';` の次の行に追加する:

```js
import { renderSettingsView } from './settings.js';
```

`bindNav`関数内の`if (view === 'foods') { openFoodsView(); } else { switchView(view); }`を次のように置き換える:

```js
      if (view === 'foods') {
        openFoodsView();
      } else if (view === 'settings') {
        switchView('settings');
        renderSettingsView(document.getElementById('view-settings'), state.db, state.goals, {
          onSaved: refreshDashboard,
        });
      } else {
        switchView(view);
      }
```

`init()`関数の末尾(`await refreshDashboard();`の後)に以下を追加する:

```js

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
```

- [ ] **Step 3: ブラウザで動作確認する**

`index.html`をブラウザで開き、以下を確認する:
- 「設定」を押すと目標値の編集フォームが表示され、現在の値(初期値: kcal2000, protein60, fat60, carb250, salt7)が入っている
- 値を変更して保存すると「保存しました」が表示される
- 「今日の記録」に戻ると、進捗バーのパーセンテージが新しい目標値を基準に再計算されている
- devtoolsのApplicationタブでService Workerが登録されている(登録エラーが出ていない)

- [ ] **Step 4: コミットする**

```bash
git add js/settings.js js/app.js
git commit -m "feat: 設定画面(settings.js)とService Worker登録を実装"
```

---

### Task 10: 結合動作確認(E2Eシナリオ)

**Files:**
- Modify: なし(確認のみ。問題が見つかった場合は該当ファイルを修正)

**Interfaces:**
- Consumes: 完成したアプリ全体
- Produces: なし(検証タスク)

- [ ] **Step 1: 一連の利用シナリオをブラウザで通しで確認する**

1. アプリを初回起動し、63件の食品がシードされていることを「食品管理」画面で確認する
2. 朝食に「食パン」100g、昼食に「うどん(ゆで)」300g、夕食に「鶏むね肉(皮なし)」150gを記録する
3. ダッシュボードの合計カロリー・PFC・塩分が3件の合計と一致していることを電卓等で検算する
4. 「設定」で目標値を変更し、ダッシュボードの進捗バーが再計算されることを確認する
5. 「食品管理」で新しい食品を1件登録し、それを使って間食を記録できることを確認する
6. 記録を1件削除し、ダッシュボードの合計が正しく減ることを確認する
7. 「前日」「翌日」で日付を移動し、別日には記録が表示されないこと、元の日に戻ると記録が残っていることを確認する
8. ブラウザをリロードしても記録・目標値が保持されている(IndexedDBに永続化されている)ことを確認する
9. devtoolsコンソール・ネットワークタブを確認し、エラーおよび外部ドメインへの通信が一切発生していないことを確認する

- [ ] **Step 2: 問題があれば該当タスクのファイルを修正し、修正内容をコミットする**

```bash
git add -A
git commit -m "fix: 結合動作確認で見つかった不具合を修正"
```

(問題がなければこのステップは不要)

---

## Self-Review メモ

- **spec coverage**: 設計書の「含める機能」(食事記録、食品DB計算、食品追加登録、目標ダッシュボード、目標設定画面、日付ナビゲーション)は Task 1・2・6・7・8・9 でそれぞれ実装される。「含めない機能」は本計画のどのタスクにも含まれていない。
- **placeholder scan**: 各タスクのコードブロックはすべて実際に動作する完全なコードであり、TBD/TODOは含まない。Task 1のfrontend-designスキル呼び出しのみ、結果が実行時に決まる性質のものだが、具体的な暫定CSS変数値を明示し、後続タスクが依存するクラス名/idは固定している。
- **type consistency**: `calcNutrientsForAmount`/`sumNutrients`/`calcProgress`(Task3)、`searchFoods`(Task4)、`openDB`/`addFood`/`updateFood`/`deleteFood`/`getAllFoods`/`getMealsByDate`/`addMeal`/`deleteMeal`/`getGoals`/`saveGoals`(Task5)、`renderGoalSummary`/`renderMealSection`(Task6)、`openMealForm`(Task7)、`renderFoodsView`(Task8)、`renderSettingsView`(Task9)の関数名・引数はすべてのタスク間で一致させた。
