import { openDB, seedFoodsIfEmpty, getAllFoods, getMealsByDate, getGoals, deleteMeal } from './db.js';
import { openMealForm } from './mealForm.js';
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

async function init() {
  state.db = await openDB();
  const seedResponse = await fetch('data/foods.json');
  const seedFoods = await seedResponse.json();
  await seedFoodsIfEmpty(state.db, seedFoods);
  state.foods = await getAllFoods(state.db);
  state.goals = await getGoals(state.db);

  bindDateNav();
  bindMealActions();
  await refreshDashboard();
}

init();
