import test from 'node:test';
import assert from 'node:assert/strict';
import { calcJoggingKcalByDate, exerciseKcalOn, ExerciseDbNotFoundError } from '../js/exerciseSync.js';

test('calcJoggingKcalByDate: 60分のジョギングは400kcalになる', () => {
  const records = [{ date: '2026-08-22', jogging: { durationMin: 60 } }];
  const result = calcJoggingKcalByDate(records, 400);
  assert.equal(result.get('2026-08-22'), 400);
});

test('calcJoggingKcalByDate: 30分のジョギングは200kcalになる', () => {
  const records = [{ date: '2026-08-21', jogging: { durationMin: 30 } }];
  const result = calcJoggingKcalByDate(records, 400);
  assert.equal(result.get('2026-08-21'), 200);
});

test('calcJoggingKcalByDate: 45分のジョギングは300kcalになる', () => {
  const records = [{ date: '2026-08-20', jogging: { durationMin: 45 } }];
  const result = calcJoggingKcalByDate(records, 400);
  assert.equal(result.get('2026-08-20'), 300);
});

test('calcJoggingKcalByDate: 20分は端数を四捨五入する(133.33→133)', () => {
  const records = [{ date: '2026-08-19', jogging: { durationMin: 20 } }];
  const result = calcJoggingKcalByDate(records, 400);
  assert.equal(result.get('2026-08-19'), 133);
});

test('calcJoggingKcalByDate: durationMinがnull/undefined/0/負数/joggingキー無し/レコードnullは除外される', () => {
  const records = [
    { date: '2026-08-01', jogging: { durationMin: null } },
    { date: '2026-08-02', jogging: { durationMin: undefined } },
    { date: '2026-08-03', jogging: { durationMin: 0 } },
    { date: '2026-08-04', jogging: { durationMin: -30 } },
    { date: '2026-08-05' }, // joggingキー無し
    null, // レコード自体がnull
    { date: '2026-08-06', jogging: { durationMin: 60 } }, // これだけ有効
  ];
  const result = calcJoggingKcalByDate(records, 400);
  assert.equal(result.size, 1);
  assert.equal(result.get('2026-08-06'), 400);
});

test('calcJoggingKcalByDate: 同じ日付が複数あれば後勝ちになる', () => {
  const records = [
    { date: '2026-08-10', jogging: { durationMin: 30 } },
    { date: '2026-08-10', jogging: { durationMin: 60 } },
  ];
  const result = calcJoggingKcalByDate(records, 400);
  assert.equal(result.get('2026-08-10'), 400);
});

test('calcJoggingKcalByDate: 空配列は空Mapを返す', () => {
  const result = calcJoggingKcalByDate([], 400);
  assert.equal(result.size, 0);
});

test('calcJoggingKcalByDate: nullは空Mapを返す', () => {
  const result = calcJoggingKcalByDate(null, 400);
  assert.equal(result.size, 0);
});

test('calcJoggingKcalByDate: undefinedは空Mapを返す', () => {
  const result = calcJoggingKcalByDate(undefined, 400);
  assert.equal(result.size, 0);
});

test('calcJoggingKcalByDate: kcalPerHourを変えると結果が変わる(600kcal/時で60分→600)', () => {
  const records = [{ date: '2026-08-22', jogging: { durationMin: 60 } }];
  const result = calcJoggingKcalByDate(records, 600);
  assert.equal(result.get('2026-08-22'), 600);
});

test('exerciseKcalOn: 存在する日付はその値を返す', () => {
  const kcalByDate = new Map([['2026-08-22', 400]]);
  assert.equal(exerciseKcalOn(kcalByDate, '2026-08-22'), 400);
});

test('exerciseKcalOn: 存在しない日付は0を返す', () => {
  const kcalByDate = new Map([['2026-08-22', 400]]);
  assert.equal(exerciseKcalOn(kcalByDate, '2026-08-23'), 0);
});

test('ExerciseDbNotFoundError: Errorのインスタンスでnameが設定されている', () => {
  const err = new ExerciseDbNotFoundError();
  assert.ok(err instanceof Error);
  assert.equal(err.name, 'ExerciseDbNotFoundError');
  assert.ok(err.message.length > 0);
});
