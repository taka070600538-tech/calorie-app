import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGoals } from '../js/db.js';

test('normalizeGoals: 空(undefined)ならDEFAULT_GOALS相当を返す', () => {
  const result = normalizeGoals(undefined);
  assert.equal(result.basalKcal, 2000);
  assert.equal(result.exerciseKcal, 0);
  assert.equal(result.kcal, 2000);
  assert.equal(result.protein, 60);
  assert.equal(result.fat, 60);
  assert.equal(result.carb, 250);
  assert.equal(result.salt, 7.0);
});

test('normalizeGoals: 空(null)ならDEFAULT_GOALS相当を返す', () => {
  const result = normalizeGoals(null);
  assert.equal(result.basalKcal, 2000);
  assert.equal(result.exerciseKcal, 0);
});

test('normalizeGoals: 空({})ならDEFAULT_GOALS相当を返す', () => {
  const result = normalizeGoals({});
  assert.equal(result.basalKcal, 2000);
  assert.equal(result.exerciseKcal, 0);
});

test('normalizeGoals: 旧形式(expenditureKcalのみ)はbasalKcalへ引き継がれる', () => {
  const result = normalizeGoals({ expenditureKcal: 2300 });
  assert.equal(result.basalKcal, 2300);
  assert.equal(result.exerciseKcal, 0);
  assert.equal('expenditureKcal' in result, false);
});

test('normalizeGoals: 新形式(basalKcal/exerciseKcal)はそのまま保持される', () => {
  const result = normalizeGoals({ basalKcal: 1600, exerciseKcal: 400 });
  assert.equal(result.basalKcal, 1600);
  assert.equal(result.exerciseKcal, 400);
});

test('normalizeGoals: 新旧混在ならbasalKcalが優先されexpenditureKcalは消える', () => {
  const result = normalizeGoals({ basalKcal: 1600, expenditureKcal: 2300 });
  assert.equal(result.basalKcal, 1600);
  assert.equal('expenditureKcal' in result, false);
});
