import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, shiftDate, diffDays, calcPresetRange } from '../js/dateUtils.js';

test('formatDate: 1桁の月日はゼロ埋めされる', () => {
  assert.equal(formatDate(new Date(2026, 0, 5)), '2026-01-05');
});

test('formatDate: 2桁の月日はそのまま', () => {
  assert.equal(formatDate(new Date(2026, 10, 23)), '2026-11-23');
});

test('shiftDate: 前日へ戻ると月をまたぐ', () => {
  assert.equal(shiftDate('2026-08-01', -1), '2026-07-31');
});

test('shiftDate: 翌日へ進むと年をまたぐ', () => {
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
});

test('shiftDate: うるう年の2月29日が存在する', () => {
  assert.equal(shiftDate('2024-02-28', 1), '2024-02-29');
});

test('shiftDate: 平年は2月28日の翌日が3月1日', () => {
  assert.equal(shiftDate('2026-02-28', 1), '2026-03-01');
});

test('shiftDate: 0日ずらすと同じ日付', () => {
  assert.equal(shiftDate('2026-08-09', 0), '2026-08-09');
});

test('diffDays: 同じ日は0', () => {
  assert.equal(diffDays('2026-08-09', '2026-08-09'), 0);
});

test('diffDays: 月をまたいでも実日数を返す', () => {
  assert.equal(diffDays('2026-07-31', '2026-08-01'), 1);
  assert.equal(diffDays('2026-08-01', '2026-08-09'), 8);
});

test('diffDays: うるう年の2月を含む差を正しく数える', () => {
  assert.equal(diffDays('2024-02-28', '2024-03-01'), 2);
  assert.equal(diffDays('2026-02-28', '2026-03-01'), 1);
});

test('diffDays: 逆順なら負の値を返す', () => {
  assert.equal(diffDays('2026-08-09', '2026-08-01'), -8);
});

test('calcPresetRange: 直近7日は今日を含めて7日間', () => {
  assert.deepEqual(calcPresetRange('2026-08-09', 7), { from: '2026-08-03', to: '2026-08-09' });
});

test('calcPresetRange: 直近1日は開始日と終了日が同じ', () => {
  assert.deepEqual(calcPresetRange('2026-08-09', 1), { from: '2026-08-09', to: '2026-08-09' });
});

test('calcPresetRange: 直近30日は月をまたぐ', () => {
  assert.deepEqual(calcPresetRange('2026-08-09', 30), { from: '2026-07-11', to: '2026-08-09' });
});
