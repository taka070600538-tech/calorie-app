# 食事記録UX改善(コンボボックス化・栄養素表記・前日転記) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 食事記録モーダルをキーボード操作しやすくし(候補プルダウン化・Tab/Enterでの保存)、栄養素表記をP/F/C略記からフル表記に変更し、前日の記録をまとめて当日にコピーできるボタンを追加する。

**Architecture:** 既存の`js/mealForm.js`(モーダルの生成・イベント配線)を書き換えてコンボボックスUIと`<form>`化を導入する。`js/render.js`と`js/mealForm.js`の栄養素表記文字列を変更する。`js/app.js`に前日転記のロジックを追加し、`index.html`にボタンを1つ追加する。すべてビルド不要の素のJS/CSS変更で完結する。

**Tech Stack:** 素のJavaScript(ESモジュール)、素のCSS、IndexedDB。外部ライブラリなし。

## Global Constraints

- ビルド不要の静的PWA構成を維持する(バンドラ・フレームワーク導入禁止)。
- ネットワーク通信は追加しない(全てローカルIndexedDB完結)。
- テストは手動確認中心という既存方針を踏襲する(`js/foodSearch.js`や`js/nutrition.js`のような純粋ロジックのみ軽量単体テスト対象。今回変更する範囲はDOM操作中心のため自動テストは追加しない)。
- 既存の`escapeHtml`によるXSS対策パターンを崩さない(食品名など動的文字列をHTMLに埋め込む箇所は必ず`escapeHtml`を通す)。

---

### Task 1: 食事記録モーダルの食品名コンボボックス化とTab/Enter保存対応

**Files:**
- Modify: `js/mealForm.js`(全面書き換え)
- Modify: `style.css:226-271`(`.food-results`関連・`.modal-actions`関連)

**Interfaces:**
- Consumes: `js/foodSearch.js`の`searchFoods(foods, query): Food[]`、`js/nutrition.js`の`calcNutrientsForAmount(per100g, amount): {kcal,protein,fat,carb,salt}`、`js/db.js`の`addMeal(db, meal): Promise<id>`・`updateMeal(db, meal): Promise<void>`、`js/render.js`の`escapeHtml(str): string`・`MEAL_TYPE_LABELS`
- Produces: `openMealForm({modalRoot, db, mealType, date, foods, onSaved, onRegisterNew, existingMeal}): void`(シグネチャは変更なし。呼び出し側の`js/app.js`は変更不要)

- [ ] **Step 1: `js/mealForm.js`を書き換える**

`js/mealForm.js`の内容を以下に置き換える(この時点では栄養素表記は既存の`P/F/C`略記のまま維持し、Task 2で変更する):

```js
import { searchFoods } from './foodSearch.js';
import { calcNutrientsForAmount } from './nutrition.js';
import { addMeal, updateMeal } from './db.js';
import { escapeHtml, MEAL_TYPE_LABELS } from './render.js';

export function openMealForm({ modalRoot, db, mealType, date, foods, onSaved, onRegisterNew, existingMeal }) {
  const isEdit = !!existingMeal;
  let selectedFood = isEdit ? foods.find((f) => f.id === existingMeal.foodId) ?? null : null;
  let currentResults = [];
  let activeIndex = -1;

  modalRoot.innerHTML = `
    <div class="modal-overlay">
      <div class="modal">
        <h2>${MEAL_TYPE_LABELS[mealType]}を${isEdit ? '編集' : '追加'}</h2>
        <form id="meal-form">
          <label for="meal-food-query">食品名</label>
          <div class="food-combobox">
            <input type="text" id="meal-food-query" autocomplete="off" placeholder="例: 白米">
            <ul id="meal-food-results" class="food-results"></ul>
          </div>
          <div id="meal-selected" class="meal-selected">
            <span id="meal-selected-name" class="meal-selected-name">${selectedFood ? escapeHtml(selectedFood.name) : '↑候補から食品を選択してください'}</span>
            <label>量(g)
              <input type="number" id="meal-amount" value="${isEdit ? existingMeal.amountGrams : 100}" min="1" step="1">
            </label>
            <div id="meal-preview" class="meal-preview"></div>
          </div>
          <p id="meal-no-result" class="hidden">見つかりません。<button id="meal-register-new" type="button">新しい食品として登録する</button></p>
          <div class="modal-actions">
            <button id="meal-save" type="submit" disabled>${isEdit ? '更新' : '保存'}</button>
            <button id="meal-cancel" type="button">キャンセル</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const form = modalRoot.querySelector('#meal-form');
  const queryInput = modalRoot.querySelector('#meal-food-query');
  const resultsList = modalRoot.querySelector('#meal-food-results');
  const selectedName = modalRoot.querySelector('#meal-selected-name');
  const amountInput = modalRoot.querySelector('#meal-amount');
  const previewBox = modalRoot.querySelector('#meal-preview');
  const noResult = modalRoot.querySelector('#meal-no-result');
  const saveBtn = modalRoot.querySelector('#meal-save');
  const cancelBtn = modalRoot.querySelector('#meal-cancel');
  const registerNewBtn = modalRoot.querySelector('#meal-register-new');

  if (selectedFood) {
    queryInput.value = selectedFood.name;
  }

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

  function closeResults() {
    currentResults = [];
    activeIndex = -1;
    resultsList.innerHTML = '';
  }

  function renderResults() {
    resultsList.innerHTML = currentResults
      .map((food, index) => `<li data-food-id="${food.id}" class="${index === activeIndex ? 'is-active' : ''}">${escapeHtml(food.name)}</li>`)
      .join('');
  }

  function selectFood(food) {
    selectedFood = food;
    selectedName.textContent = food.name;
    queryInput.value = food.name;
    closeResults();
    updatePreview();
  }

  queryInput.addEventListener('input', () => {
    selectedFood = null;
    selectedName.textContent = '↑候補から食品を選択してください';
    previewBox.textContent = '';
    saveBtn.disabled = true;

    const query = queryInput.value;
    currentResults = searchFoods(foods, query);
    activeIndex = -1;
    noResult.classList.toggle('hidden', currentResults.length > 0 || query.trim() === '');
    renderResults();
  });

  queryInput.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      if (currentResults.length === 0) return;
      event.preventDefault();
      activeIndex = Math.min(activeIndex + 1, currentResults.length - 1);
      renderResults();
    } else if (event.key === 'ArrowUp') {
      if (currentResults.length === 0) return;
      event.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      renderResults();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (activeIndex >= 0 && currentResults[activeIndex]) {
        selectFood(currentResults[activeIndex]);
      }
    } else if (event.key === 'Escape') {
      closeResults();
    }
  });

  resultsList.addEventListener('click', (event) => {
    const li = event.target.closest('li[data-food-id]');
    if (!li) return;
    const food = foods.find((f) => f.id === li.dataset.foodId);
    selectFood(food);
  });

  function handleOutsideClick(event) {
    if (event.target === queryInput || resultsList.contains(event.target)) return;
    closeResults();
  }
  document.addEventListener('click', handleOutsideClick);

  amountInput.addEventListener('input', updatePreview);

  if (selectedFood) {
    updatePreview();
  }

  registerNewBtn.addEventListener('click', () => {
    const name = queryInput.value.trim();
    closeModal();
    onRegisterNew(name);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!selectedFood) return;
    const amount = Number(amountInput.value);
    const nutrients = calcNutrientsForAmount(selectedFood.per100g, amount);
    if (isEdit) {
      await updateMeal(db, {
        ...existingMeal,
        foodId: selectedFood.id,
        amountGrams: amount,
        ...nutrients,
      });
    } else {
      await addMeal(db, {
        date,
        mealType,
        foodId: selectedFood.id,
        amountGrams: amount,
        ...nutrients,
      });
    }
    closeModal();
    onSaved();
  });

  cancelBtn.addEventListener('click', closeModal);

  function closeModal() {
    document.removeEventListener('click', handleOutsideClick);
    modalRoot.innerHTML = '';
  }
}
```

要点:
- 食品名`<label>`は`for`属性で紐付け、`<input>`と`<ul id="meal-food-results">`を`.food-combobox`でラップして相対配置の基準にする。
- `currentResults`/`activeIndex`でハイライト状態を管理し、`ArrowDown`/`ArrowUp`/`Enter`/`Escape`をハンドリングする。
- 保存ボタンを`type="submit"`にして`<form>`のsubmitイベントで保存処理を行う。ボタン順序を「保存→キャンセル」に変更(`js/foodForm.js`と統一)。
- モーダル外クリックで候補を閉じる`document`リスナーは、`closeModal()`内で必ず`removeEventListener`する(リスナーのリーク防止)。

- [ ] **Step 2: `style.css`を編集する**

`style.css`の`.food-results`と`.food-results li`のルール(226-237行目)を以下に置き換える:

```css
.food-combobox {
  position: relative;
}

.food-results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 5;
  list-style: none;
  margin: var(--spacing-xs) 0 0 0;
  padding: 0;
  max-height: 160px;
  overflow-y: auto;
}

.food-results:not(:empty) {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.food-results li {
  padding: var(--spacing-sm);
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
}

.food-results li:last-child {
  border-bottom: none;
}

.food-results li.is-active {
  background: var(--color-bg);
}
```

- [ ] **Step 3: ブラウザで動作確認する**

ローカルサーバーで`index.html`を配信し(例: `python -m http.server 8791`)、ブラウザで以下を確認する:

- 朝食など任意の区分で「＋追加」を押し、食品名欄に文字を入力すると、候補が入力欄の下にオーバーレイ(浮いた見た目)で表示され、量(g)欄が押し下げられないこと
- `↓`キーで候補のハイライトが1件ずつ進み、`↑`キーで戻ること(末尾・先頭で止まること)
- ハイライト中に`Enter`を押すと候補が確定し、候補リストが閉じ、量(g)欄・プレビューが更新されること
- ハイライトが無い状態で`Enter`を押しても何も起きないこと(誤確定しない)
- `Escape`を押すと候補が閉じ、入力したテキストは消えないこと
- 候補表示中にモーダル内の別の場所(量(g)欄など)をクリックすると候補が閉じること
- マウスクリックでの候補選択が引き続き動作すること
- 量(g)欄にフォーカスがある状態で`Tab`キーを押すと「保存」ボタンに直接フォーカスが移動すること(devtoolsコンソールで`document.activeElement.id`が`"meal-save"`になることを確認してもよい)
- 有効な量を入力した状態で量(g)欄で`Enter`を押すと保存されてモーダルが閉じること
- 既存の「見つかりません→新しい食品として登録する」導線が壊れていないこと
- 既存の編集(編集ボタンから開いて量や食品を変更→更新)が壊れていないこと
- devtoolsコンソールにエラーが出ていないこと

- [ ] **Step 4: コミットする**

```bash
git add js/mealForm.js style.css
git commit -m "feat: 食事記録モーダルの食品名候補をプルダウン化しTab/Enterで保存できるようにする"
```

---

### Task 2: 栄養素表記をP/F/C略記からフル表記に変更

**Files:**
- Modify: `js/render.js:64-66`
- Modify: `js/mealForm.js`(Task 1で書き換えた`updatePreview`内の1行)

**Interfaces:**
- Consumes: なし(既存の`meal.protein`/`meal.fat`/`meal.carb`、`nutrients.protein`/`nutrients.fat`/`nutrients.carb`をそのまま使う)
- Produces: なし(表示文字列のみの変更)

- [ ] **Step 1: `js/render.js`の表示文字列を変更する**

`js/render.js`の`renderMealSection`内、`meal-item-row2`の3行(64-66行目)を以下に置き換える:

```js
                <span>タンパク質${meal.protein}g</span>
                <span>脂質${meal.fat}g</span>
                <span>糖質${meal.carb}g</span>
```

- [ ] **Step 2: `js/mealForm.js`のプレビュー表示文字列を変更する**

`js/mealForm.js`の`updatePreview`内、以下の行を:

```js
    previewBox.textContent = `${nutrients.kcal}kcal / P${nutrients.protein}g F${nutrients.fat}g C${nutrients.carb}g 塩分${nutrients.salt}g`;
```

以下に置き換える:

```js
    previewBox.textContent = `${nutrients.kcal}kcal / タンパク質${nutrients.protein}g 脂質${nutrients.fat}g 糖質${nutrients.carb}g 塩分${nutrients.salt}g`;
```

- [ ] **Step 3: ブラウザで動作確認する**

`index.html`をブラウザで開き、以下を確認する:

- 既に記録済みの食事の一覧行が「タンパク質◯g 脂質◯g 糖質◯g 塩分◯g」というフル表記で表示されること(`P/F/C`の略記が残っていないこと)
- 画面幅を狭くしても(devtoolsのモバイル表示など)、表記が折り返されてレイアウトが崩れないこと
- 食事記録モーダルで食品を選択した際のプレビュー行も同様にフル表記になっていること
- devtoolsコンソールにエラーが出ていないこと

- [ ] **Step 4: コミットする**

```bash
git add js/render.js js/mealForm.js
git commit -m "feat: 栄養素表記をP/F/C略記からタンパク質/脂質/糖質のフル表記に変更する"
```

---

### Task 3: 「前日の内容を転記する」ボタンの実装

**Files:**
- Modify: `index.html:29-30`(`#meal-snack`セクションの直後)
- Modify: `js/app.js`(importに`addMeal`を追加、`copyPreviousDay`関数と束縛処理を追加)
- Modify: `style.css`(末尾に`.copy-previous-day-btn`を追加)

**Interfaces:**
- Consumes: `js/db.js`の`getMealsByDate(db, date): Promise<Meal[]>`・`addMeal(db, meal): Promise<id>`、`js/app.js`内の既存`state`・`shiftDate(dateStr, days): string`・`refreshDashboard(): Promise<void>`
- Produces: なし(このタスクが最終消費者)

- [ ] **Step 1: `index.html`にボタンを追加する**

`index.html`の29-30行目(`#meal-dinner`と`#meal-snack`のセクション)を以下に置き換える(`#meal-snack`の直後にボタンを追加):

```html
  <section id="meal-dinner" class="meal-section" data-meal-type="dinner"></section>
  <section id="meal-snack" class="meal-section" data-meal-type="snack"></section>
  <button id="copy-previous-day" class="copy-previous-day-btn" type="button">前日の内容を転記する</button>
```

- [ ] **Step 2: `style.css`にボタンのスタイルを追加する**

`style.css`の末尾に以下を追加する:

```css
.copy-previous-day-btn {
  display: block;
  width: 100%;
  padding: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-primary);
  font-size: 0.9rem;
}
```

- [ ] **Step 3: `js/app.js`に転記ロジックを実装する**

1行目のimportを以下に置き換える(`addMeal`を追加):

```js
import { openDB, seedFoodsIfEmpty, getAllFoods, getMealsByDate, getGoals, deleteMeal, addMeal } from './db.js';
```

`bindMealActions`関数の閉じ`}`の直後(`showStartupErrorBanner`関数の定義の直前)に以下の関数を追加する:

```js
async function copyPreviousDay() {
  const previousDate = shiftDate(state.date, -1);
  try {
    const previousMeals = await getMealsByDate(state.db, previousDate);
    if (previousMeals.length === 0) {
      alert('前日の記録がありません。');
      return;
    }
    const confirmed = confirm(`前日(${previousDate})の記録${previousMeals.length}件を今日に追加しますか?`);
    if (!confirmed) return;
    for (const meal of previousMeals) {
      await addMeal(state.db, {
        date: state.date,
        mealType: meal.mealType,
        foodId: meal.foodId,
        freeText: meal.freeText,
        amountGrams: meal.amountGrams,
        kcal: meal.kcal,
        protein: meal.protein,
        fat: meal.fat,
        carb: meal.carb,
        salt: meal.salt,
      });
    }
    await refreshDashboard();
  } catch (err) {
    alert('前日の記録の転記に失敗しました。');
  }
}

function bindCopyPreviousDay() {
  document.getElementById('copy-previous-day').addEventListener('click', copyPreviousDay);
}
```

`init`関数内、`bindMealActions();`の行の直後に以下を追加する:

```js
  bindCopyPreviousDay();
```

- [ ] **Step 4: ブラウザで動作確認する**

`index.html`をブラウザで開き、以下を確認する:

- ダッシュボードの間食セクションの下に「前日の内容を転記する」ボタンが表示されること
- 前日に記録が無い状態でボタンを押すと「前日の記録がありません。」というアラートが出て、何も追加されないこと
- 前日に記録がある状態でボタンを押すと「前日(YYYY-MM-DD)の記録◯件を今日に追加しますか?」という確認ダイアログが出ること
- 確認ダイアログでキャンセルすると何も追加されないこと
- 確認ダイアログでOKすると、前日の全区分(朝食/昼食/夕食/間食)の記録が当日にコピーされ、各区分の一覧・ダッシュボードの合計値/進捗バーが正しく更新されること
- コピー後、コピー元(前日)の記録は変化していないこと(「前日→翌日」で前日を再確認)
- devtoolsコンソールにエラーが出ていないこと

- [ ] **Step 5: コミットする**

```bash
git add index.html js/app.js style.css
git commit -m "feat: 前日の記録をまとめて当日に転記するボタンを追加する"
```
