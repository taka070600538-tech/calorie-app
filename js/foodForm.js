import { addFood, updateFood, deleteFood } from './db.js';
import { escapeHtml } from './render.js';
import { loadMextTable, searchMextFoods } from './mextTable.js';
import { loadDishTable, searchDishes } from './dishTable.js';

export function renderFoodsView(container, db, foods, { prefillName = '', onChange } = {}) {
  container.innerHTML = `
    <h2>成分表から探す</h2>
    <p class="search-help">日本食品標準成分表(八訂)増補2023年から選ぶと、栄養値が下のフォームに入ります。</p>
    <input type="search" id="mext-query" class="search-query" placeholder="例: 精白米" autocomplete="off">
    <ul id="mext-results" class="search-results"></ul>

    <h2>料理から探す</h2>
    <p class="search-help">久留米市「料理の栄養価一覧」から選ぶと、栄養値が下のフォームに入ります。</p>
    <input type="search" id="dish-query" class="search-query" placeholder="例: 親子丼" autocomplete="off">
    <ul id="dish-results" class="search-results"></ul>

    <h2>食品の登録・編集</h2>
    <form id="food-form" class="food-form">
      <input type="hidden" id="food-id">
      <input type="hidden" id="food-mext-code">
      <input type="hidden" id="food-kurume-id">
      <label>食品名 <input type="text" id="food-name" required></label>
      <label>カロリー(kcal/100g) <input type="number" id="food-kcal" step="0.1" min="0" required></label>
      <label>タンパク質(g/100g) <input type="number" id="food-protein" step="0.1" min="0" required></label>
      <label>脂質(g/100g) <input type="number" id="food-fat" step="0.1" min="0" required></label>
      <label>糖質(g/100g) <input type="number" id="food-carb" step="0.1" min="0" required></label>
      <label>塩分(g/100g) <input type="number" id="food-salt" step="0.1" min="0" required></label>
      <div class="food-form-actions">
        <button type="submit">保存</button>
        <button type="button" id="food-form-reset">クリア</button>
      </div>
    </form>

    <h2>登録済みの食品</h2>
    <ul id="food-list" class="food-list"></ul>
  `;

  const form = container.querySelector('#food-form');
  const idInput = container.querySelector('#food-id');
  const mextCodeInput = container.querySelector('#food-mext-code');
  const kurumeIdInput = container.querySelector('#food-kurume-id');
  const nameInput = container.querySelector('#food-name');
  const kcalInput = container.querySelector('#food-kcal');
  const proteinInput = container.querySelector('#food-protein');
  const fatInput = container.querySelector('#food-fat');
  const carbInput = container.querySelector('#food-carb');
  const saltInput = container.querySelector('#food-salt');
  const list = container.querySelector('#food-list');
  const resetBtn = container.querySelector('#food-form-reset');
  const mextQuery = container.querySelector('#mext-query');
  const mextResults = container.querySelector('#mext-results');
  const dishQuery = container.querySelector('#dish-query');
  const dishResults = container.querySelector('#dish-results');

  let mextTable = null;
  let mextLoadFailed = false;
  let dishTable = null;
  let dishLoadFailed = false;

  function resetForm() {
    form.reset();
    idInput.value = '';
    mextCodeInput.value = '';
    kurumeIdInput.value = '';
  }

  function fillForm(food) {
    idInput.value = food.id;
    mextCodeInput.value = food.mextCode ?? '';
    kurumeIdInput.value = food.kurumeId ?? '';
    nameInput.value = food.name;
    kcalInput.value = food.per100g.kcal;
    proteinInput.value = food.per100g.protein;
    fatInput.value = food.per100g.fat;
    carbInput.value = food.per100g.carb;
    saltInput.value = food.per100g.salt;
    nameInput.focus();
  }

  function fillFormFromMext(mextFood) {
    mextCodeInput.value = mextFood.code;
    kurumeIdInput.value = '';
    nameInput.value = mextFood.name;
    kcalInput.value = mextFood.per100g.kcal;
    proteinInput.value = mextFood.per100g.protein;
    fatInput.value = mextFood.per100g.fat;
    carbInput.value = mextFood.per100g.carb;
    saltInput.value = mextFood.per100g.salt;
    // 正式名称は長いので、すぐ短い名前に打ち替えられるよう全選択しておく。
    nameInput.focus();
    nameInput.select();
  }

  function fillFormFromDish(dish) {
    kurumeIdInput.value = dish.code;
    mextCodeInput.value = '';
    nameInput.value = dish.name;
    kcalInput.value = dish.per100g.kcal;
    proteinInput.value = dish.per100g.protein;
    fatInput.value = dish.per100g.fat;
    carbInput.value = dish.per100g.carb;
    saltInput.value = dish.per100g.salt;
    nameInput.focus();
    nameInput.select();
  }

  function renderSearchMessage(resultsEl, message) {
    resultsEl.innerHTML = `<li class="search-message">${escapeHtml(message)}</li>`;
  }

  function renderMextResults(results) {
    if (results.length === 0) {
      renderSearchMessage(mextResults, '該当する品目がありません。ひらがな・漢字など表記を変えてお試しください(例: 豚肉 → ぶた)');
      return;
    }
    mextResults.innerHTML = results
      .map(
        (food) => `
        <li data-mext-code="${escapeHtml(food.code)}">
          <span class="search-result-name">${escapeHtml(food.name)}</span>
          <span class="search-result-meta">${escapeHtml(food.group)} / ${food.per100g.kcal}kcal</span>
        </li>`
      )
      .join('');
  }

  function renderDishResults(results) {
    if (results.length === 0) {
      renderSearchMessage(dishResults, '該当する料理がありません');
      return;
    }
    dishResults.innerHTML = results
      .map(
        (dish) => `
        <li data-dish-code="${escapeHtml(dish.code)}">
          <span class="search-result-name">${escapeHtml(dish.name)}</span>
          <span class="search-result-meta">${escapeHtml(dish.group)} / ${dish.per100g.kcal}kcal</span>
        </li>`
      )
      .join('');
  }

  async function handleMextQuery() {
    const query = mextQuery.value;
    if (query.trim() === '') {
      mextResults.innerHTML = '';
      return;
    }
    if (mextLoadFailed) {
      renderSearchMessage(mextResults, '成分表の読み込みに失敗しました');
      return;
    }
    if (!mextTable) {
      renderSearchMessage(mextResults, '成分表を読み込んでいます...');
      try {
        mextTable = await loadMextTable();
      } catch (err) {
        mextLoadFailed = true;
        renderSearchMessage(mextResults, '成分表の読み込みに失敗しました');
        return;
      }
      // 読み込み中に入力が変わっている場合があるため、最新の値で検索し直す。
      if (mextQuery.value.trim() === '') {
        mextResults.innerHTML = '';
        return;
      }
    }
    renderMextResults(searchMextFoods(mextTable, mextQuery.value));
  }

  async function handleDishQuery() {
    const query = dishQuery.value;
    if (query.trim() === '') {
      dishResults.innerHTML = '';
      return;
    }
    if (dishLoadFailed) {
      renderSearchMessage(dishResults, '料理データの読み込みに失敗しました');
      return;
    }
    if (!dishTable) {
      renderSearchMessage(dishResults, '料理データを読み込んでいます...');
      try {
        dishTable = await loadDishTable();
      } catch (err) {
        dishLoadFailed = true;
        renderSearchMessage(dishResults, '料理データの読み込みに失敗しました');
        return;
      }
      if (dishQuery.value.trim() === '') {
        dishResults.innerHTML = '';
        return;
      }
    }
    renderDishResults(searchDishes(dishTable, dishQuery.value));
  }

  mextQuery.addEventListener('input', handleMextQuery);
  dishQuery.addEventListener('input', handleDishQuery);

  mextResults.addEventListener('click', (event) => {
    const li = event.target.closest('li[data-mext-code]');
    if (!li || !mextTable) return;
    const mextFood = mextTable.find((f) => f.code === li.dataset.mextCode);
    if (!mextFood) return;
    fillFormFromMext(mextFood);
    mextQuery.value = '';
    mextResults.innerHTML = '';
  });

  dishResults.addEventListener('click', (event) => {
    const li = event.target.closest('li[data-dish-code]');
    if (!li || !dishTable) return;
    const dish = dishTable.find((d) => d.code === li.dataset.dishCode);
    if (!dish) return;
    fillFormFromDish(dish);
    dishQuery.value = '';
    dishResults.innerHTML = '';
  });

  function renderList() {
    if (foods.length === 0) {
      list.innerHTML = '<li class="food-list-empty">まだ食品が登録されていません。上の検索欄から探して登録してください。</li>';
      return;
    }
    const sorted = [...foods].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    list.innerHTML = sorted
      .map(
        (food) => `
        <li data-food-id="${food.id}">
          <span>${escapeHtml(food.name)}(${food.per100g.kcal}kcal/100g)</span>
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
    const mextCode = mextCodeInput.value || undefined;
    const kurumeId = kurumeIdInput.value || undefined;
    if (idInput.value) {
      const existing = foods.find((f) => f.id === idInput.value);
      const updated = { ...existing, name: nameInput.value, per100g };
      if (mextCode) updated.mextCode = mextCode;
      if (kurumeId) updated.kurumeId = kurumeId;
      await updateFood(db, updated);
      Object.assign(existing, updated);
    } else {
      const newFood = { name: nameInput.value, per100g, category: '未分類', source: 'custom' };
      if (mextCode) newFood.mextCode = mextCode;
      if (kurumeId) newFood.kurumeId = kurumeId;
      const id = await addFood(db, newFood);
      foods.push({ ...newFood, id });
    }
    resetForm();
    renderList();
    onChange?.();
  });

  resetBtn.addEventListener('click', resetForm);

  if (prefillName) {
    nameInput.value = prefillName;
    mextQuery.value = prefillName;
    handleMextQuery();
    nameInput.focus();
  }

  renderList();
}
