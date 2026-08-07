import { calcProgress } from './nutrition.js';

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

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

export const MEAL_TYPE_LABELS = {
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
              <span class="meal-item-name">${escapeHtml(name)} ${meal.amountGrams}g</span>
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
