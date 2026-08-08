import { openDB, seedFoodsIfEmpty, getAllFoods, getMealsByDate, getGoals, deleteMeal, addMeal } from './db.js';
import { openMealForm } from './mealForm.js';
import { renderFoodsView } from './foodForm.js';
import { renderSettingsView } from './settings.js';
import { sumNutrients } from './nutrition.js';
import { renderGoalSummary, renderMealSection } from './render.js';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

const state = {
  date: formatDate(new Date()),
  foods: [],
  goals: null,
  db: null,
  meals: [],
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
  state.meals = meals;
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
      } else if (view === 'settings') {
        switchView('settings');
        renderSettingsView(document.getElementById('view-settings'), state.db, state.goals, {
          onSaved: refreshDashboard,
        });
      } else {
        switchView(view);
      }
    });
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
        onRegisterNew: (name) => openFoodsView(name),
      });
      return;
    }
    const editBtn = event.target.closest('[data-action="edit-meal"]');
    if (editBtn) {
      const mealId = Number(editBtn.dataset.mealId);
      const existingMeal = state.meals.find((m) => m.id === mealId);
      if (!existingMeal) return;
      openMealForm({
        modalRoot: document.getElementById('modal-root'),
        db: state.db,
        mealType: existingMeal.mealType,
        date: state.date,
        foods: state.foods,
        existingMeal,
        onSaved: refreshDashboard,
        onRegisterNew: (name) => openFoodsView(name),
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

async function copyPreviousDay() {
  const previousDate = shiftDate(state.date, -1);
  try {
    const previousMeals = await getMealsByDate(state.db, previousDate);
    if (previousMeals.length === 0) {
      alert('前日の記録がありません。');
      return;
    }
    const confirmed = confirm(`${previousDate}の記録${previousMeals.length}件を${state.date}に追加しますか?`);
    if (!confirmed) return;
    for (const meal of previousMeals) {
      const { id, date: _sourceDate, ...rest } = meal;
      await addMeal(state.db, { ...rest, date: state.date });
    }
  } catch (err) {
    console.error(err);
    alert('前日の記録の転記に失敗しました。');
  } finally {
    await refreshDashboard();
  }
}

function bindCopyPreviousDay() {
  document.getElementById('copy-previous-day').addEventListener('click', copyPreviousDay);
}

function showStartupErrorBanner(message) {
  const banner = document.createElement('div');
  banner.className = 'startup-error-banner';
  banner.textContent = message;
  document.body.insertBefore(banner, document.body.firstChild);
}

async function init() {
  try {
    state.db = await openDB();
  } catch (err) {
    showStartupErrorBanner('データベースを利用できません。記録は保存されません。');
    return;
  }

  try {
    const seedResponse = await fetch('data/foods.json');
    const seedFoods = await seedResponse.json();
    await seedFoodsIfEmpty(state.db, seedFoods);
    state.foods = await getAllFoods(state.db);
    state.goals = await getGoals(state.db);
  } catch (err) {
    showStartupErrorBanner('食品データの読み込みに失敗しました。');
    return;
  }

  bindDateNav();
  bindMealActions();
  bindCopyPreviousDay();
  bindNav();
  await refreshDashboard();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
