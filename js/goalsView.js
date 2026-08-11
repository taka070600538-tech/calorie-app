import { saveGoals } from './db.js';

export function renderGoalsView(container, db, goals, { onSaved } = {}) {
  container.innerHTML = `
    <h2>目標</h2>
    <form id="goals-form" class="goals-form">
      <h3 class="settings-heading">栄養目標</h3>
      <div class="form-grid">
        <label>カロリー(kcal) <input type="number" id="goal-kcal" value="${goals.kcal}" min="0" step="1"></label>
        <label>タンパク質(g) <input type="number" id="goal-protein" value="${goals.protein}" min="0" step="0.1"></label>
        <label>脂質(g) <input type="number" id="goal-fat" value="${goals.fat}" min="0" step="0.1"></label>
        <label>糖質(g) <input type="number" id="goal-carb" value="${goals.carb}" min="0" step="0.1"></label>
        <label>塩分(g) <input type="number" id="goal-salt" value="${goals.salt}" min="0" step="0.1"></label>
      </div>
      <h3 class="settings-heading">消費カロリー</h3>
      <div class="form-grid">
        <label>基礎代謝(kcal) <input type="number" id="goal-basal" value="${goals.basalKcal}" min="0" step="1"></label>
        <label>運動(kcal) <input type="number" id="goal-exercise" value="${goals.exerciseKcal}" min="0" step="1"></label>
      </div>
      <p class="settings-note">基礎代謝+運動の合計を、分析タブのカロリー収支と体脂肪換算の計算に使います。</p>
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
      basalKcal: Number(container.querySelector('#goal-basal').value),
      exerciseKcal: Number(container.querySelector('#goal-exercise').value),
    };
    await saveGoals(db, newGoals);
    Object.assign(goals, newGoals);
    savedMsg.classList.remove('hidden');
    setTimeout(() => savedMsg.classList.add('hidden'), 2000);
    onSaved?.();
  });
}
