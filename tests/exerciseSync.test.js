import test from 'node:test';
import assert from 'node:assert/strict';
import { calcJoggingKcalPerDay, ExerciseDbNotFoundError } from '../js/exerciseSync.js';

test('calcJoggingKcalPerDay: 期間内のdurationMin合計から1日平均kcalを計算する', () => {
  const records = [
    { date: '2026-08-22', jogging: { durationMin: 60 } },
    { date: '2026-08-10', jogging: { durationMin: 30 } },
    { date: '2026-08-01', jogging: { durationMin: 30 } },
  ];
  const result = calcJoggingKcalPerDay(records, '2026-08-22', 30, 400);
  assert.equal(result.totalMin, 120);
  assert.equal(result.joggingDays, 3);
  assert.equal(result.kcalPerDay, 27);
  assert.equal(result.days, 30);
  assert.equal(result.to, '2026-08-22');
});

test('calcJoggingKcalPerDay: fromはtodayの29日前になる', () => {
  const result = calcJoggingKcalPerDay([], '2026-08-22', 30, 400);
  assert.equal(result.from, '2026-07-24');
});

test('calcJoggingKcalPerDay: 範囲外(fromより前、todayより後)の記録は除外される', () => {
  const records = [
    { date: '2026-07-23', jogging: { durationMin: 100 } }, // fromの前日
    { date: '2026-08-23', jogging: { durationMin: 100 } }, // todayの翌日
    { date: '2026-08-22', jogging: { durationMin: 60 } }, // 範囲内
  ];
  const result = calcJoggingKcalPerDay(records, '2026-08-22', 30, 400);
  assert.equal(result.totalMin, 60);
  assert.equal(result.joggingDays, 1);
});

test('calcJoggingKcalPerDay: durationMinがnull/undefined/0/負数/joggingキー無しの日は除外される', () => {
  const records = [
    { date: '2026-08-20', jogging: { durationMin: null } },
    { date: '2026-08-19', jogging: { durationMin: undefined } },
    { date: '2026-08-18', jogging: { durationMin: 0 } },
    { date: '2026-08-17', jogging: { durationMin: -30 } },
    { date: '2026-08-16' }, // joggingキー無し
    { date: '2026-08-15', jogging: { durationMin: 45 } }, // これだけ有効
  ];
  const result = calcJoggingKcalPerDay(records, '2026-08-22', 30, 400);
  assert.equal(result.totalMin, 45);
  assert.equal(result.joggingDays, 1);
});

test('calcJoggingKcalPerDay: 記録が空配列ならkcalPerDay 0, joggingDays 0', () => {
  const result = calcJoggingKcalPerDay([], '2026-08-22', 30, 400);
  assert.equal(result.kcalPerDay, 0);
  assert.equal(result.joggingDays, 0);
  assert.equal(result.totalMin, 0);
});

test('calcJoggingKcalPerDay: kcalPerHourとdaysを変えると結果が変わる', () => {
  const records = [
    { date: '2026-08-22', jogging: { durationMin: 60 } },
    { date: '2026-08-21', jogging: { durationMin: 60 } },
  ];
  const result = calcJoggingKcalPerDay(records, '2026-08-22', 7, 600);
  assert.equal(result.totalMin, 120);
  assert.equal(result.days, 7);
  // 120/60*600/7 = 1200/7 = 171.43 -> 171
  assert.equal(result.kcalPerDay, 171);
});

test('ExerciseDbNotFoundError: Errorのインスタンスでnameが設定されている', () => {
  const err = new ExerciseDbNotFoundError();
  assert.ok(err instanceof Error);
  assert.equal(err.name, 'ExerciseDbNotFoundError');
  assert.ok(err.message.length > 0);
});
