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
