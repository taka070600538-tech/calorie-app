import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBackupPayload, validateBackupData } from '../js/backup.js';

const sample = {
  foods: [{ id: 'custom_1', name: 'ごはん', kcal: 168 }],
  meals: [{ id: 1, date: '2026-08-10', mealType: 'breakfast', foodId: 'custom_1', amount: 150 }],
  goals: { id: 'default', kcal: 2000, protein: 60, fat: 60, carb: 250, salt: 7, expenditureKcal: 2100 },
};

test('buildBackupPayload: version 1とexportedAtと全データを含む', () => {
  const now = new Date(2026, 7, 10, 12, 0);
  const payload = buildBackupPayload(sample, now);
  assert.equal(payload.version, 1);
  assert.equal(payload.exportedAt, now.toISOString());
  assert.deepEqual(payload.foods, sample.foods);
  assert.deepEqual(payload.meals, sample.meals);
  assert.deepEqual(payload.goals, sample.goals);
});

test('validateBackupData: buildBackupPayloadの出力をそのまま受理する(往復)', () => {
  const payload = buildBackupPayload(sample);
  assert.equal(validateBackupData(payload), payload);
});

test('validateBackupData: versionが違えば例外', () => {
  const bad = { ...buildBackupPayload(sample), version: 2 };
  assert.throws(() => validateBackupData(bad), /version/);
});

test('validateBackupData: foodsが配列でなければ例外', () => {
  const bad = { ...buildBackupPayload(sample), foods: null };
  assert.throws(() => validateBackupData(bad), /foods/);
});

test('validateBackupData: goalsがオブジェクトでなければ例外', () => {
  const bad = { ...buildBackupPayload(sample), goals: null };
  assert.throws(() => validateBackupData(bad), /goals/);
});
