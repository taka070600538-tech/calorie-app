import test from 'node:test';
import assert from 'node:assert/strict';
import { groupMealsByDate, calcPeriodStats } from '../js/analytics.js';

function meal(date, kcal, protein, fat, carb, salt) {
  return { date, kcal, protein, fat, carb, salt };
}

test('groupMealsByDate: 同じ日の複数記録が1行に合算される', () => {
  const meals = [
    meal('2026-08-01', 500, 20, 15, 60, 1.5),
    meal('2026-08-01', 300, 10, 5, 40, 0.5),
  ];
  assert.deepEqual(groupMealsByDate(meals), [
    { date: '2026-08-01', kcal: 800, protein: 30, fat: 20, carb: 100, salt: 2 },
  ]);
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
