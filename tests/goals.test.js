import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGoals } from '../js/db.js';

test('normalizeGoals: 空(undefined)なら栄養目標の既定値を返す', () => {
  const result = normalizeGoals(undefined);
  assert.equal(result.kcal, 2000);
  assert.equal(result.protein, 60);
  assert.equal(result.fat, 60);
  assert.equal(result.carb, 250);
  assert.equal(result.salt, 7.0);
  assert.equal('basalKcal' in result, false);
  assert.equal('exerciseKcal' in result, false);
  assert.equal('expenditureKcal' in result, false);
});

test('normalizeGoals: 空(null)なら栄養目標の既定値を返す', () => {
  const result = normalizeGoals(null);
  assert.equal(result.kcal, 2000);
  assert.equal('basalKcal' in result, false);
  assert.equal('exerciseKcal' in result, false);
  assert.equal('expenditureKcal' in result, false);
});

test('normalizeGoals: 空({})なら栄養目標の既定値を返す', () => {
  const result = normalizeGoals({});
  assert.equal(result.kcal, 2000);
  assert.equal('basalKcal' in result, false);
  assert.equal('exerciseKcal' in result, false);
  assert.equal('expenditureKcal' in result, false);
});

test('normalizeGoals: 旧形式(expenditureKcalのみ)を渡してもフィールドは含まれない', () => {
  const result = normalizeGoals({ expenditureKcal: 2300 });
  assert.equal('expenditureKcal' in result, false);
  assert.equal('basalKcal' in result, false);
  assert.equal('exerciseKcal' in result, false);
  assert.equal(result.kcal, 2000);
});

test('normalizeGoals: 旧形式(basalKcal/exerciseKcal)を渡してもフィールドは含まれない', () => {
  const result = normalizeGoals({ basalKcal: 1600, exerciseKcal: 400 });
  assert.equal('basalKcal' in result, false);
  assert.equal('exerciseKcal' in result, false);
});

test('normalizeGoals: 栄養目標の指定値は保持される', () => {
  const result = normalizeGoals({ kcal: 1800, protein: 80, fat: 50, carb: 200, salt: 6 });
  assert.equal(result.kcal, 1800);
  assert.equal(result.protein, 80);
  assert.equal(result.fat, 50);
  assert.equal(result.carb, 200);
  assert.equal(result.salt, 6);
});
