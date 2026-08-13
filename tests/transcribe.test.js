import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDaySection, upsertSection, datesToTranscribe } from '../tools/transcribe.mjs';

const meals = [
  { date: '2026-08-10', mealType: 'breakfast', kcal: 320, protein: 20.1, fat: 10.05, carb: 40.2, salt: 1.4 },
  { date: '2026-08-10', mealType: 'lunch', kcal: 450, protein: 25.1, fat: 12.05, carb: 55.1, salt: 2.1 },
  { date: '2026-08-10', mealType: 'dinner', kcal: 464, protein: 15, fat: 8, carb: 55, salt: 0.7 },
  { date: '2026-08-11', mealType: 'snack', kcal: 3, protein: 0.2, fat: 0, carb: 0.4, salt: 0 },
  { date: '2026-08-11', mealType: 'snack', kcal: 7, protein: 0.1, fat: 0.1, carb: 0.3, salt: 0 },
  { date: '2026-08-11', mealType: 'custom_type', kcal: 100, protein: 1, fat: 1, carb: 1, salt: 0.1 },
];

test('buildDaySection: 合計行と食事区分別の行を朝食→昼食→夕食の順で出す(kcalは整数、栄養素は小数1桁)', () => {
  assert.equal(
    buildDaySection(meals, '2026-08-10'),
    [
      '## カロリー記録',
      '',
      '- 合計: 1234kcal (たんぱく質60.2g / 脂質30.1g / 炭水化物150.3g / 塩分4.2g)',
      '- 朝食: 320kcal',
      '- 昼食: 450kcal',
      '- 夕食: 464kcal',
    ].join('\n')
  );
});

test('buildDaySection: 浮動小数点誤差が出ないよう表示時に丸める(0.2+0.1=0.3)', () => {
  const out = buildDaySection(meals, '2026-08-11');
  // 0.2 + 0.1 + 1 (custom) = 1.3 のはずが、丸めていないと 1.2999999999999998 になる
  assert.match(out, /たんぱく質1\.3g/);
});

test('buildDaySection: 同じmealTypeは合算し、未知のmealTypeはラベルそのまま表示', () => {
  const out = buildDaySection(meals, '2026-08-11');
  assert.equal(
    out,
    [
      '## カロリー記録',
      '',
      '- 合計: 110kcal (たんぱく質1.3g / 脂質1.1g / 炭水化物1.7g / 塩分0.1g)',
      '- 間食: 10kcal',
      '- custom_type: 100kcal',
    ].join('\n')
  );
});

test('buildDaySection: その日のmealsが無ければnull', () => {
  assert.equal(buildDaySection(meals, '2026-01-01'), null);
});

test('datesToTranscribe: 当日を除いた日付昇順', () => {
  assert.deepEqual(datesToTranscribe(meals, '2026-08-11'), ['2026-08-10']);
});

test('upsertSection: マーカーが無ければ末尾に追記', () => {
  const out = upsertSection('既存の本文\n', 'セクション');
  assert.equal(out, '既存の本文\n\n<!-- calorie-app:start -->\nセクション\n<!-- calorie-app:end -->\n');
});

test('upsertSection: 既存マーカー区間だけを置換し他は触らない', () => {
  const before = '前文\n\n<!-- calorie-app:start -->\n古い内容\n<!-- calorie-app:end -->\n後文\n';
  const out = upsertSection(before, '新しい内容');
  assert.equal(out, '前文\n\n<!-- calorie-app:start -->\n新しい内容\n<!-- calorie-app:end -->\n後文\n');
});

test('upsertSection: CRLFの日記ではCRLFを保つ', () => {
  const out = upsertSection('本文\r\n', 'A\nB');
  assert.equal(out, '本文\r\n\r\n<!-- calorie-app:start -->\r\nA\r\nB\r\n<!-- calorie-app:end -->\r\n');
});

test('upsertSection: 空ファイルにはブロックのみ', () => {
  assert.equal(upsertSection('', 'S'), '<!-- calorie-app:start -->\nS\n<!-- calorie-app:end -->\n');
});
