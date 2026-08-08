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
    previewBox.textContent = `${nutrients.kcal}kcal / タンパク質${nutrients.protein}g 脂質${nutrients.fat}g 糖質${nutrients.carb}g 塩分${nutrients.salt}g`;
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

  async function doSave() {
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
  }

  amountInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (saveBtn.disabled) return;
    doSave();
  });

  if (selectedFood) {
    updatePreview();
  }

  registerNewBtn.addEventListener('click', () => {
    const name = queryInput.value.trim();
    closeModal();
    onRegisterNew(name);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    doSave();
  });

  cancelBtn.addEventListener('click', closeModal);

  function closeModal() {
    document.removeEventListener('click', handleOutsideClick);
    modalRoot.innerHTML = '';
  }
}
