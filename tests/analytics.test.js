import test from 'node:test';
import assert from 'node:assert/strict';
import { groupMealsByDate, calcPeriodStats, dailyBalanceKcal } from '../js/analytics.js';
// analyticsView.js はDOM操作を行う renderAnalyticsView も含むが、それらはすべて関数本体の中にあり、
// モジュールの読み込み時（トップレベル）では document/window に触れない（METRICS/PRESETSは単なる配列リテラル）。
// node -e での動的importでも問題なく読み込めることを確認済み。
import { METRICS } from '../js/analyticsView.js';

function meal(date, kcal, protein, fat, carb, salt) {
  return { date, kcal, protein, fat, carb, salt };
}

test('groupMealsByDate: 同じ日の複数記録が1行に合算される', () => {
  const meals = [
    meal('2026-08-01', 500, 20, 15, 60, 1.5),
    meal('2026-08-01', 300, 10, 5, 40, 0.5),
  ];
  assert.deepEqual(groupMealsByDate(meals), [
    { date: '2026-08-01', kcal: 800, protein: 30, fat: 20, carb: 100, salt: 2, exerciseKcal: 0 },
  ]);
});

test('groupMealsByDate: exerciseKcalByDateを渡すと該当日にexerciseKcalが入る', () => {
  const meals = [
    meal('2026-08-01', 500, 20, 15, 60, 1.5),
    meal('2026-08-02', 300, 10, 5, 40, 0.5),
  ];
  const exerciseKcalByDate = new Map([['2026-08-01', 400]]);
  const result = groupMealsByDate(meals, exerciseKcalByDate);
  assert.equal(result.find((d) => d.date === '2026-08-01').exerciseKcal, 400);
  assert.equal(result.find((d) => d.date === '2026-08-02').exerciseKcal, 0);
});

test('groupMealsByDate: 入力順にかかわらず日付昇順で返す', () => {
  const meals = [
    meal('2026-08-03', 300, 1, 1, 1, 0.1),
    meal('2026-08-01', 100, 1, 1, 1, 0.1),
    meal('2026-08-02', 200, 1, 1, 1, 0.1),
  ];
  assert.deepEqual(groupMealsByDate(meals).map((d) => d.date), [
    '2026-08-01', '2026-08-02', '2026-08-03',
  ]);
});

test('groupMealsByDate: 記録の無い日は要素にならない', () => {
  const meals = [
    meal('2026-08-01', 100, 1, 1, 1, 0.1),
    meal('2026-08-05', 200, 1, 1, 1, 0.1),
  ];
  const result = groupMealsByDate(meals);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((d) => d.date), ['2026-08-01', '2026-08-05']);
});

test('groupMealsByDate: 空配列は空配列を返す', () => {
  assert.deepEqual(groupMealsByDate([]), []);
});

test('groupMealsByDate: METRICSの全キーが日別集計の各エントリに数値として存在する', () => {
  // analyticsView.js の renderChartSection は day[metric.key] という形でアクセスするため、
  // METRICS のキーと groupMealsByDate が返すオブジェクトのプロパティ名が一致していないと、
  // 全テストが緑のままグラフだけが static に壊れる（NaN座標で空描画）。その契約をここで固定する。
  const meals = [
    meal('2026-08-01', 500, 20, 15, 60, 1.5),
    meal('2026-08-02', 300, 10, 5, 40, 0.5),
  ];
  const result = groupMealsByDate(meals);
  assert.equal(result.length, 2);
  for (const day of result) {
    for (const metric of METRICS) {
      assert.ok(
        Number.isFinite(day[metric.key]),
        `${metric.key} should be a finite number on ${day.date}, got ${day[metric.key]}`
      );
    }
  }
});

test('calcPeriodStats: 平均・摂取合計・消費合計を計算する', () => {
  const dailyTotals = [
    { date: '2026-08-01', kcal: 2500, protein: 90, fat: 70, carb: 300, salt: 8 },
    { date: '2026-08-02', kcal: 2300, protein: 80, fat: 60, carb: 280, salt: 7 },
  ];
  const stats = calcPeriodStats(dailyTotals, 2000);
  assert.equal(stats.dayCount, 2);
  assert.deepEqual(stats.averages, { kcal: 2400, protein: 85, fat: 65, carb: 290, salt: 7.5 });
  assert.equal(stats.totalIntakeKcal, 4800);
  assert.equal(stats.totalExpenditureKcal, 4000);
});

test('calcPeriodStats: 摂取が消費を上回るとプラスの収支と体脂肪換算になる', () => {
  const dailyTotals = [
    { date: '2026-08-01', kcal: 2500, protein: 0, fat: 0, carb: 0, salt: 0 },
    { date: '2026-08-02', kcal: 2300, protein: 0, fat: 0, carb: 0, salt: 0 },
  ];
  const stats = calcPeriodStats(dailyTotals, 2000);
  assert.equal(stats.energyBalanceKcal, 800);
  assert.equal(stats.bodyFatKg, 0.11);
});

test('calcPeriodStats: 摂取が消費を下回るとマイナスの収支と体脂肪換算になる', () => {
  const dailyTotals = [
    { date: '2026-08-01', kcal: 1500, protein: 0, fat: 0, carb: 0, salt: 0 },
  ];
  const stats = calcPeriodStats(dailyTotals, 2000);
  assert.equal(stats.energyBalanceKcal, -500);
  assert.equal(stats.bodyFatKg, -0.07);
});

test('calcPeriodStats: 記録が0日でも0除算せずすべて0を返す', () => {
  const stats = calcPeriodStats([], 2000);
  assert.equal(stats.dayCount, 0);
  assert.deepEqual(stats.averages, { kcal: 0, protein: 0, fat: 0, carb: 0, salt: 0 });
  assert.equal(stats.totalIntakeKcal, 0);
  assert.equal(stats.totalExpenditureKcal, 0);
  assert.equal(stats.energyBalanceKcal, 0);
  assert.equal(stats.bodyFatKg, 0);
});

test('calcPeriodStats: 消費カロリーが0なら収支は摂取合計と等しい', () => {
  const dailyTotals = [
    { date: '2026-08-01', kcal: 1800, protein: 0, fat: 0, carb: 0, salt: 0 },
  ];
  const stats = calcPeriodStats(dailyTotals, 0);
  assert.equal(stats.totalExpenditureKcal, 0);
  assert.equal(stats.energyBalanceKcal, 1800);
});

test('calcPeriodStats: 平均は栄養素ごとに小数1桁へ丸める', () => {
  const dailyTotals = [
    { date: '2026-08-01', kcal: 2000, protein: 70, fat: 55, carb: 250, salt: 7 },
    { date: '2026-08-02', kcal: 2001, protein: 71, fat: 56, carb: 251, salt: 8 },
    { date: '2026-08-03', kcal: 2002, protein: 72, fat: 57, carb: 252, salt: 9 },
  ];
  const stats = calcPeriodStats(dailyTotals, 2000);
  assert.equal(stats.averages.kcal, 2001);
  assert.equal(stats.averages.protein, 71);
  assert.equal(stats.averages.salt, 8);
});

test('calcPeriodStats: 非整数の消費カロリーでも消費合計は整数になる', () => {
  const dailyTotals = [
    { date: '2026-08-01', kcal: 2000, protein: 0, fat: 0, carb: 0, salt: 0 },
    { date: '2026-08-02', kcal: 2000, protein: 0, fat: 0, carb: 0, salt: 0 },
  ];
  const stats = calcPeriodStats(dailyTotals, 2000.5);
  assert.equal(stats.totalExpenditureKcal, 4001);
  assert.equal(Number.isInteger(stats.totalExpenditureKcal), true);
});

test('calcPeriodStats: exerciseKcal付きのdailyTotalsでtotalExerciseKcal・totalExpenditureKcal・energyBalanceKcalが正しく計算される', () => {
  const dailyTotals = [
    { date: '2026-08-01', kcal: 2500, protein: 0, fat: 0, carb: 0, salt: 0, exerciseKcal: 300 },
    { date: '2026-08-02', kcal: 2300, protein: 0, fat: 0, carb: 0, salt: 0, exerciseKcal: 0 },
  ];
  const stats = calcPeriodStats(dailyTotals, 2000);
  assert.equal(stats.totalBasalKcal, 4000);
  assert.equal(stats.totalExerciseKcal, 300);
  assert.equal(stats.totalExpenditureKcal, 4300);
  assert.equal(stats.totalIntakeKcal, 4800);
  assert.equal(stats.energyBalanceKcal, 500);
});

test('calcPeriodStats: basalKcalを省略すると既定値2000として計算される', () => {
  const dailyTotals = [
    { date: '2026-08-01', kcal: 2500, protein: 0, fat: 0, carb: 0, salt: 0, exerciseKcal: 0 },
  ];
  const stats = calcPeriodStats(dailyTotals);
  assert.equal(stats.totalBasalKcal, 2000);
  assert.equal(stats.totalExpenditureKcal, 2000);
});

test('dailyBalanceKcal: 運動ありの日は摂取−(基礎代謝+運動)になる', () => {
  const day = { date: '2026-08-01', kcal: 2500, exerciseKcal: 300 };
  assert.equal(dailyBalanceKcal(day, 2000), 200);
});

test('dailyBalanceKcal: 運動なしの日は摂取−基礎代謝になる', () => {
  const day = { date: '2026-08-01', kcal: 1800, exerciseKcal: 0 };
  assert.equal(dailyBalanceKcal(day, 2000), -200);
});

test('dailyBalanceKcal: exerciseKcalが無いフィールドでも0として扱う', () => {
  const day = { date: '2026-08-01', kcal: 1800 };
  assert.equal(dailyBalanceKcal(day, 2000), -200);
});

test('dailyBalanceKcal: basalKcalを省略すると既定値2000として計算される', () => {
  const day = { date: '2026-08-01', kcal: 2000, exerciseKcal: 0 };
  assert.equal(dailyBalanceKcal(day), 0);
});
