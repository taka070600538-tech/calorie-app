import { calcProgress, sumNutrients } from './nutrition.js';

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// 符号付きのkcal表示を作る(0は"0"、正は"+"付き、負は"-"付き、桁区切りあり)。
export function formatSignedKcal(value) {
  if (value === 0) return '0';
  const sign = value > 0 ? '+' : '-';
  return `${sign}${Math.abs(value).toLocaleString('ja-JP')}`;
}

function balanceSignClass(value) {
  if (value > 0) return 'is-surplus';
  if (value < 0) return 'is-deficit';
  return '';
}

export function renderGoalSummary(container, totals, goals, extras = [], expenditure = null) {
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

  let balanceHtml = '';
  if (expenditure !== null) {
    const { basalKcal, exerciseKcal, available } = expenditure;
    const expenditureKcal = basalKcal + exerciseKcal;
    const balance = totals.kcal - expenditureKcal;
    const noteHtml = available === false
      ? '<p class="goal-balance-note">運動管理アプリのデータが見つからないため、運動は0kcalとして計算しています。</p>'
      : '';
    balanceHtml = `
      <div class="goal-balance">
        <div class="goal-balance-row"><span>消費</span><span>${expenditureKcal.toLocaleString('ja-JP')} kcal(基礎代謝 ${basalKcal.toLocaleString('ja-JP')} + 運動 ${exerciseKcal.toLocaleString('ja-JP')})</span></div>
        <div class="goal-balance-row"><span>収支</span><span class="${balanceSignClass(balance)}">${formatSignedKcal(balance)} kcal</span></div>
        ${noteHtml}
      </div>
    `;
  }

  container.innerHTML = goalRowsHtml + extraRowsHtml + balanceHtml;
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
              <div class="meal-item-row1">
                <span class="meal-item-name">${escapeHtml(name)}</span>
                <div class="meal-item-actions">
                  <button class="meal-item-edit" data-action="edit-meal" data-meal-id="${meal.id}">編集</button>
                  <button class="meal-item-delete" data-action="delete-meal" data-meal-id="${meal.id}">削除</button>
                </div>
              </div>
              <div class="meal-item-row2">
                <span>${meal.amountGrams}g</span>
                <span>${meal.kcal}kcal</span>
                <span>タンパク質${meal.protein}g</span>
                <span>脂質${meal.fat}g</span>
                <span>糖質${meal.carb}g</span>
                <span>塩分${meal.salt}g</span>
              </div>
            </li>
          `;
        })
        .join('');

  const totals = sumNutrients(meals);
  const totalsHtml = meals.length === 0
    ? ''
    : `
      <div class="meal-section-total">
        <span>合計</span>
        <span>${totals.kcal}kcal</span>
        <span>タンパク質${totals.protein}g</span>
        <span>脂質${totals.fat}g</span>
        <span>糖質${totals.carb}g</span>
        <span>塩分${totals.salt}g</span>
      </div>
    `;

  container.innerHTML = `
    <div class="meal-section-header">
      <h2>${label}</h2>
      <div class="meal-section-buttons">
        <button class="photo-meal-btn" data-action="photo-meal" data-meal-type="${mealType}">📷 写真</button>
        <button class="add-meal-btn" data-action="add-meal" data-meal-type="${mealType}">＋ 追加</button>
      </div>
    </div>
    ${totalsHtml}
    <ul class="meal-list">${itemsHtml}</ul>
  `;
}
