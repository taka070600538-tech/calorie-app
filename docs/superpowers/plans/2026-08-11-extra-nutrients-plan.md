# 食品固有栄養素の登録と日次合計表示 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 食品にDHA・EPA・ポリフェノール等の固有栄養素(100gあたり量)を登録できるようにし、「今日の記録」の塩分の行の直下にその日の合計を表示する。

**Architecture:** ビルド不要の静的PWA(ESモジュール)。foodsに任意フィールド `extraNutrients`、mealsに保存時計算のコピー `extras` を追加する(DBスキーマ変更なし)。純粋ロジックは `nutrition.js`、UIは `foodForm.js` / `mealForm.js` / `render.js`。

**Tech Stack:** Vanilla JS (ESM)、IndexedDB、node:test(`node --test tests/*.test.js`)

## Global Constraints

- 仕様書: `docs/superpowers/specs/2026-08-11-extra-nutrients-design.md`
- 数値の丸めは既存に合わせ小数第1位: `Math.round(x * 10) / 10`
- 単位は `mg` / `g` / `µg` の3択。同じ栄養素名は同じ単位に揃える前提(既出名選択で単位を自動追従)
- 有効な固有栄養素が0件の食品には `extraNutrients` フィールド自体を付けない。extras同様
- 既存食品・既存記録(フィールド無し)と混在しても動くこと
- UIの文言は日本語。コードのコメント密度・命名は既存ファイルに合わせる
- テスト実行: リポジトリルートで `node --test tests/*.test.js`(全件パスを維持)
- 作業は専用ブランチ(worktree)。masterには触らない(マージは検証後)

---

### Task 1: nutrition.js に calcExtrasForAmount / sumExtras を追加(TDD)

**Files:**
- Modify: `js/nutrition.js`
- Test: `tests/nutrition.test.js`

**Interfaces:**
- Consumes: なし(純粋関数のみ)
- Produces:
  - `calcExtrasForAmount(extraNutrients, amountGrams)` → `[{ name, unit, amount }]`。引数 `extraNutrients` は `[{ name, unit, per100g }]` または `undefined`(undefinedなら `[]` を返す)
  - `sumExtras(meals)` → `[{ name, unit, amount }]`(名前の五十音順)。引数は `extras` フィールドを持ちうるオブジェクトの配列

- [ ] **Step 1: 失敗するテストを書く**

`tests/nutrition.test.js` の末尾(importに `calcExtrasForAmount, sumExtras` を追加)に:

```js
test('calcExtrasForAmount: 100gちょうどは per100g の値と同じ', () => {
  const extraNutrients = [{ name: 'DHA', unit: 'mg', per100g: 860 }];
  assert.deepEqual(calcExtrasForAmount(extraNutrients, 100), [
    { name: 'DHA', unit: 'mg', amount: 860 },
  ]);
});

test('calcExtrasForAmount: 150gは1.5倍・小数第1位に丸める', () => {
  const extraNutrients = [
    { name: 'DHA', unit: 'mg', per100g: 860 },
    { name: 'ポリフェノール', unit: 'mg', per100g: 33.3 },
  ];
  assert.deepEqual(calcExtrasForAmount(extraNutrients, 150), [
    { name: 'DHA', unit: 'mg', amount: 1290 },
    { name: 'ポリフェノール', unit: 'mg', amount: 50 },
  ]);
});

test('calcExtrasForAmount: undefinedや空配列は空配列を返す', () => {
  assert.deepEqual(calcExtrasForAmount(undefined, 100), []);
  assert.deepEqual(calcExtrasForAmount([], 100), []);
});

test('calcExtrasForAmount: 0gは全て0になる', () => {
  const extraNutrients = [{ name: 'EPA', unit: 'mg', per100g: 930 }];
  assert.deepEqual(calcExtrasForAmount(extraNutrients, 0), [
    { name: 'EPA', unit: 'mg', amount: 0 },
  ]);
});

test('sumExtras: 同じ名前を合算し五十音順に並べる', () => {
  const meals = [
    { extras: [{ name: 'DHA', unit: 'mg', amount: 500 }] },
    { extras: [
      { name: 'ポリフェノール', unit: 'mg', amount: 120 },
      { name: 'DHA', unit: 'mg', amount: 350.5 },
    ] },
  ];
  assert.deepEqual(sumExtras(meals), [
    { name: 'DHA', unit: 'mg', amount: 850.5 },
    { name: 'ポリフェノール', unit: 'mg', amount: 120 },
  ]);
});

test('sumExtras: extrasが無い食事と混在しても落ちない', () => {
  const meals = [
    { kcal: 500 },
    { kcal: 300, extras: [{ name: 'ALA', unit: 'g', amount: 1.2 }] },
  ];
  assert.deepEqual(sumExtras(meals), [{ name: 'ALA', unit: 'g', amount: 1.2 }]);
});

test('sumExtras: 全食事にextrasが無ければ空配列', () => {
  assert.deepEqual(sumExtras([{ kcal: 100 }, {}]), []);
});

test('sumExtras: 浮動小数の合算も小数第1位に丸める', () => {
  const meals = [
    { extras: [{ name: 'EPA', unit: 'mg', amount: 0.1 }] },
    { extras: [{ name: 'EPA', unit: 'mg', amount: 0.2 }] },
  ];
  assert.deepEqual(sumExtras(meals), [{ name: 'EPA', unit: 'mg', amount: 0.3 }]);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/nutrition.test.js`
Expected: FAIL(`calcExtrasForAmount` が export されていない旨のSyntaxError/ReferenceError)

- [ ] **Step 3: 最小実装を書く**

`js/nutrition.js` の末尾(`calcProgress` の前でも後でも可)に:

```js
export function calcExtrasForAmount(extraNutrients, amountGrams) {
  const ratio = amountGrams / 100;
  return (extraNutrients ?? []).map((n) => ({
    name: n.name,
    unit: n.unit,
    amount: Math.round(n.per100g * ratio * 10) / 10,
  }));
}

export function sumExtras(meals) {
  const totals = new Map();
  for (const meal of meals) {
    for (const extra of meal.extras ?? []) {
      const current = totals.get(extra.name);
      if (current) {
        current.amount = Math.round((current.amount + extra.amount) * 10) / 10;
      } else {
        totals.set(extra.name, { ...extra });
      }
    }
  }
  return [...totals.values()].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test tests/nutrition.test.js`
Expected: PASS(既存テスト含め全件)

- [ ] **Step 5: コミット**

```bash
git add js/nutrition.js tests/nutrition.test.js
git commit -m "feat: 固有栄養素の量計算と日次合算ロジックを追加する"
```

---

### Task 2: 食品登録フォームに固有栄養素セクションを追加

**Files:**
- Modify: `js/foodForm.js`
- Modify: `style.css`

**Interfaces:**
- Consumes: なし(このタスクはフォームUIのみ。保存形式は仕様書どおり `food.extraNutrients = [{ name, unit, per100g }]`)
- Produces: foods レコードの任意フィールド `extraNutrients`(Task 3・4がmeals経由で参照)

- [ ] **Step 1: フォームHTMLに固有栄養素セクションを追加**

`js/foodForm.js` の `container.innerHTML` 内、`塩分(g/100g)` の label と `.food-form-actions` の間に:

```html
      <fieldset class="extra-nutrients">
        <legend>固有栄養素(任意)</legend>
        <p class="search-help">DHA、EPA、ポリフェノールなど、食品固有の栄養素を100gあたりの量で登録できます。</p>
        <div id="extra-rows"></div>
        <button type="button" id="extra-add">＋ 栄養素を追加</button>
        <datalist id="extra-name-suggestions"></datalist>
      </fieldset>
```

- [ ] **Step 2: 行の追加・削除・読み書きロジックを実装**

`renderFoodsView` 内(`resetForm` の定義より前)に要素参照とヘルパーを追加:

```js
const extraRows = container.querySelector('#extra-rows');
const extraAddBtn = container.querySelector('#extra-add');
const extraSuggestions = container.querySelector('#extra-name-suggestions');

// 登録済み食品の固有栄養素から「名前→単位」の対応を集める(サジェストと単位自動追従に使う)
function collectKnownExtras() {
  const known = new Map();
  for (const food of foods) {
    for (const extra of food.extraNutrients ?? []) {
      if (!known.has(extra.name)) known.set(extra.name, extra.unit);
    }
  }
  return known;
}

function renderExtraSuggestions() {
  const known = collectKnownExtras();
  extraSuggestions.innerHTML = [...known.keys()]
    .map((name) => `<option value="${escapeHtml(name)}"></option>`)
    .join('');
}

function addExtraRow({ name = '', unit = 'mg', per100g = '' } = {}) {
  const row = document.createElement('div');
  row.className = 'extra-row';
  row.innerHTML = `
    <input type="text" class="extra-name" list="extra-name-suggestions" placeholder="栄養素名(例: DHA)" value="${escapeHtml(name)}">
    <select class="extra-unit">
      <option value="mg">mg</option>
      <option value="g">g</option>
      <option value="µg">µg</option>
    </select>
    <input type="number" class="extra-amount" min="0" step="0.1" placeholder="量/100g" value="${escapeHtml(per100g)}">
    <button type="button" class="extra-remove" aria-label="この栄養素を削除">✕</button>
  `;
  row.querySelector('.extra-unit').value = unit;
  // 既出の栄養素名を選んだら、単位をその名前の登録済み単位に揃える
  row.querySelector('.extra-name').addEventListener('input', (event) => {
    const knownUnit = collectKnownExtras().get(event.target.value.trim());
    if (knownUnit) row.querySelector('.extra-unit').value = knownUnit;
  });
  row.querySelector('.extra-remove').addEventListener('click', () => row.remove());
  extraRows.appendChild(row);
}

// 名前と量が両方入っている行だけを拾う。0件なら undefined(フィールド自体を付けない)
function readExtraRows() {
  const result = [];
  for (const row of extraRows.querySelectorAll('.extra-row')) {
    const name = row.querySelector('.extra-name').value.trim();
    const amountRaw = row.querySelector('.extra-amount').value;
    if (name === '' || amountRaw === '') continue;
    result.push({
      name,
      unit: row.querySelector('.extra-unit').value,
      per100g: Number(amountRaw),
    });
  }
  return result.length > 0 ? result : undefined;
}

function clearExtraRows() {
  extraRows.innerHTML = '';
}

extraAddBtn.addEventListener('click', () => addExtraRow());
```

`renderFoodsView` の末尾付近(`renderList()` 呼び出しの前)に `renderExtraSuggestions();` を追加。

- [ ] **Step 3: 既存のフォーム操作に組み込む**

- `resetForm()` の末尾に `clearExtraRows();`
- `fillForm(food)` に(`saltInput.value = ...` の後):

```js
clearExtraRows();
for (const extra of food.extraNutrients ?? []) {
  addExtraRow(extra);
}
```

- `fillFormFromMext(mextFood)` と `fillFormFromDish(dish)` の両方に `clearExtraRows();` を追加(元データに固有栄養素は無いため)。
- submit ハンドラーで、`per100g` 構築の直後に `const extraNutrients = readExtraRows();` を追加し:
  - 編集分岐: `delete updated.mextCode;` の並びに `delete updated.extraNutrients;` を追加し、`if (extraNutrients) updated.extraNutrients = extraNutrients;` を `if (kurumeId) ...` の後に追加。`existing` 側も同様に `delete existing.extraNutrients;` を追加(mextCode/kurumeIdと同じパターン)。
  - 新規分岐: `if (extraNutrients) newFood.extraNutrients = extraNutrients;` を追加。
- submit 成功後(`renderList()` の並び)に `renderExtraSuggestions();` を追加(いま登録した名前を次回から候補に出す)。

- [ ] **Step 4: スタイルを追加**

`style.css` の食品フォーム関連(`.food-form` 付近)に:

```css
.extra-nutrients {
  border: 1px solid var(--border-color, #ccc);
  border-radius: 8px;
  padding: 0.75rem;
}

.extra-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.5rem;
}

.extra-row .extra-name {
  flex: 1;
  min-width: 0;
}

.extra-row .extra-amount {
  width: 6.5rem;
}
```

※ 既存CSSに変数や色定義の慣習があればそちらに合わせること。

- [ ] **Step 5: テスト全件と構文確認**

Run: `node --test tests/*.test.js`
Expected: PASS(このタスクでテストは増えないが、壊していないことを確認)

Run: `node --check js/foodForm.js`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add js/foodForm.js style.css
git commit -m "feat: 食品登録フォームに固有栄養素の入力セクションを追加する"
```

---

### Task 3: 食事の保存時にextrasを計算して記録する

**Files:**
- Modify: `js/mealForm.js`

**Interfaces:**
- Consumes: `calcExtrasForAmount(extraNutrients, amountGrams)`(Task 1)、`food.extraNutrients`(Task 2)
- Produces: meals レコードの任意フィールド `extras = [{ name, unit, amount }]`(Task 4が参照)

- [ ] **Step 1: importを追加**

```js
import { calcNutrientsForAmount, calcExtrasForAmount } from './nutrition.js';
```

- [ ] **Step 2: プレビューに固有栄養素を表示**

`updatePreview()` の `previewBox.textContent = ...` を:

```js
const extras = calcExtrasForAmount(selectedFood.extraNutrients, amount);
const extrasText = extras.map((e) => ` ${e.name}${e.amount}${e.unit}`).join('');
previewBox.textContent = `${nutrients.kcal}kcal / タンパク質${nutrients.protein}g 脂質${nutrients.fat}g 糖質${nutrients.carb}g 塩分${nutrients.salt}g${extrasText}`;
```

- [ ] **Step 3: 保存時にextrasを付ける**

`doSave()` の `const nutrients = ...` の直後に:

```js
const extras = calcExtrasForAmount(selectedFood.extraNutrients, amount);
```

編集分岐を以下に変更(食品を extras の無いものへ変えた場合に古い extras が残らないよう、明示的に消してから付け直す):

```js
if (isEdit) {
  const updated = {
    ...existingMeal,
    foodId: selectedFood.id,
    amountGrams: amount,
    ...nutrients,
  };
  delete updated.extras;
  if (extras.length > 0) updated.extras = extras;
  await updateMeal(db, updated);
} else {
  const meal = {
    date,
    mealType,
    foodId: selectedFood.id,
    amountGrams: amount,
    ...nutrients,
  };
  if (extras.length > 0) meal.extras = extras;
  await addMeal(db, meal);
}
```

- [ ] **Step 4: テスト全件と構文確認**

Run: `node --test tests/*.test.js`
Expected: PASS

Run: `node --check js/mealForm.js`
Expected: エラーなし

- [ ] **Step 5: コミット**

```bash
git add js/mealForm.js
git commit -m "feat: 食事の保存時に固有栄養素を量に応じて記録する"
```

---

### Task 4: 今日の記録の塩分の下に固有栄養素の合計を表示する

**Files:**
- Modify: `js/render.js`
- Modify: `js/app.js`
- Modify: `style.css`

**Interfaces:**
- Consumes: `sumExtras(meals)`(Task 1)、meals の `extras`(Task 3)
- Produces: `renderGoalSummary(container, totals, goals, extras = [])`(第4引数は省略可。省略時は従来と同じ表示)

- [ ] **Step 1: renderGoalSummary に extras 表示を追加**

`js/render.js` の `renderGoalSummary` を第4引数 `extras = []` を取る形に変更し、
既存5行のHTMLの後ろに連結:

```js
export function renderGoalSummary(container, totals, goals, extras = []) {
  const rows = [
    { label: 'カロリー', unit: 'kcal', current: totals.kcal, goal: goals.kcal },
    { label: 'タンパク質', unit: 'g', current: totals.protein, goal: goals.protein },
    { label: '脂質', unit: 'g', current: totals.fat, goal: goals.fat },
    { label: '糖質', unit: 'g', current: totals.carb, goal: goals.carb },
    { label: '塩分', unit: 'g', current: totals.salt, goal: goals.salt },
  ];

  const goalRowsHtml = rows
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

  // 固有栄養素は目標値を持たないため、進捗バーなしの1行で塩分の下に並べる
  const extraRowsHtml = extras
    .map(
      (extra) => `
        <div class="goal-row goal-row-extra">
          <div class="goal-row-label">
            <span>${escapeHtml(extra.name)}</span>
            <span>${extra.amount}${escapeHtml(extra.unit)}</span>
          </div>
        </div>
      `
    )
    .join('');

  container.innerHTML = goalRowsHtml + extraRowsHtml;
}
```

※ `escapeHtml` は同ファイル内で定義済み。

- [ ] **Step 2: app.js から extras を渡す**

`js/app.js` の import を `import { sumNutrients, sumExtras } from './nutrition.js';` に変更し、
`refreshDashboard()` 内の呼び出しを:

```js
renderGoalSummary(document.getElementById('goal-summary'), totals, state.goals, sumExtras(meals));
```

- [ ] **Step 3: renderGoalSummary の他の呼び出し箇所を確認**

Run: `grep -rn "renderGoalSummary" js/`
Expected: 定義(render.js)と app.js のみ。他にあれば第4引数省略で従来表示になることを確認(コード変更不要)。

- [ ] **Step 4: スタイルを追加**

`style.css` の `.goal-row` 関連の並びに:

```css
.goal-row-extra .goal-row-label {
  font-size: 0.9em;
  opacity: 0.85;
}
```

- [ ] **Step 5: テスト全件と構文確認**

Run: `node --test tests/*.test.js`
Expected: PASS

Run: `node --check js/render.js` と `node --check js/app.js`
Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
git add js/render.js js/app.js style.css
git commit -m "feat: 今日の記録の塩分の下に固有栄養素の合計を表示する"
```

---

### Task 5: Service Workerキャッシュ更新と全体テスト

**Files:**
- Modify: `sw.js`

**Interfaces:**
- Consumes: Task 1〜4の全変更
- Produces: なし(リリース準備)

- [ ] **Step 1: CACHE_NAME を1つ上げる**

`sw.js` の `CACHE_NAME` の末尾番号をインクリメントする(例: `calorie-app-v10` → `calorie-app-v11`)。現在の番号はファイルを開いて確認すること。並行作業とマージする際は番号が重複しないよう最終的に揃える。

- [ ] **Step 2: テスト全件実行**

Run: `node --test tests/*.test.js`
Expected: PASS(全件)

- [ ] **Step 3: コミット**

```bash
git add sw.js
git commit -m "chore: 固有栄養素機能のリリースに向けてSWキャッシュを更新する"
```

---

### Task 6: ブラウザでの動作検証(メインセッションが実施)

**Files:** なし(検証のみ)

**Interfaces:**
- Consumes: Task 1〜5の全変更

- [ ] **Step 1: ローカルサーバーで起動して一連の操作を確認**

`python -m http.server <未使用ポート>` で配信し、以下を確認:

1. 「食品」画面: 成分表から「さば」等を選び、固有栄養素にDHA(mg)・EPA(mg)を追加して保存できる
2. 保存した食品を編集で開くと固有栄養素の行が復元される
3. 「今日の記録」で追加モーダルを開き、その食品を選ぶとプレビューにDHA/EPA量が出る
4. 150g等で保存すると、栄養サマリーの塩分の直下に合計行(進捗バーなし)が出る
5. 固有栄養素の無い食品だけの日は合計行が出ない
6. 2件目の食品(同じDHAを含む)を記録すると合算される
7. コンソールにエラーが出ていない

- [ ] **Step 2: 検証結果を記録し、マージ方針をユーザーに確認**
