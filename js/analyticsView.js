import { getMealsByDateRange } from './db.js';
import { groupMealsByDate, calcPeriodStats, dailyBalanceKcal } from './analytics.js';
import { formatDate, calcPresetRange } from './dateUtils.js';
import { calcProgress } from './nutrition.js';
import { escapeHtml, formatSignedKcal } from './render.js';
import { buildLineChartSvg } from './lineChart.js';
import { loadExerciseKcalByDate, BASAL_KCAL, JOGGING_KCAL_PER_HOUR } from './exerciseSync.js';

export const METRICS = [
  { key: 'kcal', label: 'カロリー', unit: 'kcal' },
  { key: 'protein', label: 'タンパク質', unit: 'g' },
  { key: 'fat', label: '脂質', unit: 'g' },
  { key: 'carb', label: '糖質', unit: 'g' },
  { key: 'salt', label: '塩分', unit: 'g' },
];

const PRESETS = [
  { days: 7, label: '直近7日' },
  { days: 30, label: '直近30日' },
  { days: 90, label: '直近90日' },
];

function formatSignedKg(value) {
  const fixed = value.toFixed(2);
  if (Number(fixed) === 0) return '0.00';
  return value > 0 ? `+${fixed}` : fixed;
}

function signClass(value) {
  if (value > 0) return 'is-surplus';
  if (value < 0) return 'is-deficit';
  return '';
}

function renderSummary(stats, goals, from, to, exerciseAvailable) {
  const rows = METRICS.map((metric) => {
    const average = stats.averages[metric.key];
    const goal = goals[metric.key];
    return `
      <tr>
        <th>${metric.label}</th>
        <td>${average.toLocaleString('ja-JP')}${metric.unit}</td>
        <td class="analytics-progress">目標の${calcProgress(average, goal)}%</td>
      </tr>
    `;
  }).join('');

  const warningHtml = exerciseAvailable === false
    ? '<p class="analytics-note is-warning">運動管理アプリのデータが見つからないため、運動は0kcalとして計算しています。</p>'
    : '';

  return `
    <p class="analytics-range">${stats.dayCount}日分の記録（${escapeHtml(from)} 〜 ${escapeHtml(to)}）</p>
    <h3 class="analytics-heading">1日あたりの平均</h3>
    <table class="analytics-avg-table"><tbody>${rows}</tbody></table>
    <h3 class="analytics-heading">カロリー収支</h3>
    <dl class="analytics-balance">
      <div><dt>摂取合計</dt><dd>${stats.totalIntakeKcal.toLocaleString('ja-JP')} kcal</dd></div>
      <div><dt>消費合計</dt><dd>${stats.totalExpenditureKcal.toLocaleString('ja-JP')} kcal<small>(基礎代謝 ${stats.totalBasalKcal.toLocaleString('ja-JP')} + 運動 ${stats.totalExerciseKcal.toLocaleString('ja-JP')})</small></dd></div>
      <div><dt>収支</dt><dd class="${signClass(stats.energyBalanceKcal)}">${formatSignedKcal(stats.energyBalanceKcal)} kcal</dd></div>
      <div><dt>体脂肪換算</dt><dd class="${signClass(stats.bodyFatKg)}">${formatSignedKg(stats.bodyFatKg)} kg</dd></div>
    </dl>
    <p class="analytics-note">消費カロリー = 基礎代謝 ${BASAL_KCAL.toLocaleString('ja-JP')} kcal/日(固定)+ 運動(運動管理アプリのジョギング時間 × ${JOGGING_KCAL_PER_HOUR.toLocaleString('ja-JP')}kcal/時)として計算</p>
    ${warningHtml}
  `;
}

function renderChartSection(state, goals) {
  const metric = METRICS.find((m) => m.key === state.metric);
  const points = state.dailyTotals.map((day) => ({ date: day.date, value: day[metric.key] }));
  const svg = buildLineChartSvg(points, {
    goalValue: goals[metric.key],
    unit: metric.unit,
    fromDate: state.from,
    toDate: state.to,
  });
  return `<div class="analytics-chart">${svg}</div>`;
}

function renderTabs(currentMetric) {
  return `
    <div class="analytics-tabs">
      ${METRICS.map((m) => `
        <button type="button" class="analytics-tab-btn${m.key === currentMetric ? ' is-active' : ''}" data-metric="${m.key}">${m.label}</button>
      `).join('')}
    </div>
  `;
}

function renderTable(dailyTotals) {
  // groupMealsByDate は日付昇順で返すので、表示は新しい順へ反転する。
  const rows = [...dailyTotals].reverse().map((day) => {
    const balance = dailyBalanceKcal(day);
    return `
      <tr>
        <td>${escapeHtml(day.date)}</td>
        <td>${day.kcal.toLocaleString('ja-JP')}</td>
        <td>${day.protein}</td>
        <td>${day.fat}</td>
        <td>${day.carb}</td>
        <td>${day.salt}</td>
        <td>${day.exerciseKcal.toLocaleString('ja-JP')}</td>
        <td class="${signClass(balance)}">${formatSignedKcal(balance)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="analytics-table-wrap">
      <table class="analytics-table">
        <thead>
          <tr>
            <th>日付</th><th>kcal</th><th>タンパク質</th><th>脂質</th><th>糖質</th><th>塩分</th><th>運動</th><th>収支</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

export function renderAnalyticsView(container, db, goals) {
  const today = formatDate(new Date());
  const initialRange = calcPresetRange(today, 7);
  const state = {
    from: initialRange.from,
    to: initialRange.to,
    metric: 'kcal',
    dailyTotals: [],
  };

  container.innerHTML = `
    <h2>分析</h2>
    <div class="analytics-period">
      <div class="analytics-presets">
        ${PRESETS.map((p) => `<button type="button" class="analytics-preset-btn" data-days="${p.days}">${p.label}</button>`).join('')}
      </div>
      <div class="analytics-dates">
        <label>開始 <input type="date" id="analytics-from" value="${state.from}"></label>
        <label>終了 <input type="date" id="analytics-to" value="${state.to}"></label>
      </div>
    </div>
    <div id="analytics-body"></div>
  `;

  const body = container.querySelector('#analytics-body');
  const fromInput = container.querySelector('#analytics-from');
  const toInput = container.querySelector('#analytics-to');

  function showMessage(message) {
    body.innerHTML = `<p class="analytics-message">${escapeHtml(message)}</p>`;
  }

  function renderBody() {
    const stats = calcPeriodStats(state.dailyTotals);
    body.innerHTML = renderSummary(stats, goals, state.from, state.to, state.exerciseAvailable)
      + `<h3 class="analytics-heading">推移</h3>`
      + renderTabs(state.metric)
      + renderChartSection(state, goals)
      + `<h3 class="analytics-heading">日別</h3>`
      + renderTable(state.dailyTotals);
  }

  async function load() {
    // 日付入力は空にできる。空のまま範囲クエリを投げると全期間が返ってしまうので先に弾く。
    if (!state.from || !state.to) {
      showMessage('開始日と終了日を指定してください。');
      return;
    }
    if (state.from > state.to) {
      showMessage('開始日が終了日より後です。');
      return;
    }
    try {
      const [meals, exercise] = await Promise.all([
        getMealsByDateRange(db, state.from, state.to),
        loadExerciseKcalByDate(),
      ]);
      state.dailyTotals = groupMealsByDate(meals, exercise.kcalByDate);
      state.exerciseAvailable = exercise.available;
    } catch (err) {
      console.error(err);
      showMessage('記録の読み込みに失敗しました。');
      return;
    }
    if (state.dailyTotals.length === 0) {
      showMessage('この期間に記録がありません。');
      return;
    }
    renderBody();
  }

  body.addEventListener('click', (event) => {
    const tabBtn = event.target.closest('.analytics-tab-btn');
    if (!tabBtn) return;
    state.metric = tabBtn.dataset.metric;
    // 期間は変わっていないので取得済みデータから描き直すだけでよい。
    renderBody();
  });

  container.querySelectorAll('.analytics-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const range = calcPresetRange(formatDate(new Date()), Number(btn.dataset.days));
      state.from = range.from;
      state.to = range.to;
      // プリセットを押したら日付入力も同期させ、何日から何日を見ているか常に読み取れるようにする。
      fromInput.value = state.from;
      toInput.value = state.to;
      load();
    });
  });

  fromInput.addEventListener('change', () => {
    state.from = fromInput.value;
    load();
  });
  toInput.addEventListener('change', () => {
    state.to = toInput.value;
    load();
  });

  load();
}
