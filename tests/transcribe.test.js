import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDaySection, buildFoodNames, upsertSection, datesToTranscribe } from '../tools/transcribe.mjs';

const foodNames = buildFoodNames([
  { id: 'f1', name: 'レタス' },
  { id: 'f2', name: 'ごはん' },
  { id: 'f3', name: '月花さば水煮' },
  { id: 'f4', name: 'えごま油' },
  { id: 'f5', name: 'どら焼き' },
]);

const meals = [
  { date: '2026-08-10', mealType: 'breakfast', foodId: 'f1', amountGrams: 25, kcal: 320, protein: 20.1, fat: 10.05, carb: 40.2, salt: 1.4 },
  { date: '2026-08-10', mealType: 'lunch', foodId: 'f2', amountGrams: 150, kcal: 450, protein: 25.1, fat: 12.05, carb: 55.1, salt: 2.1,
    extras: [{ name: 'DHA', unit: 'mg', amount: 1017.5 }, { name: 'EPA', unit: 'mg', amount: 527 }] },
  { date: '2026-08-10', mealType: 'dinner', foodId: 'f3', amountGrams: 50, kcal: 464, protein: 15, fat: 8, carb: 55, salt: 0.7,
    extras: [{ name: 'DHA', unit: 'mg', amount: 100.25 }] },
  { date: '2026-08-11', mealType: 'snack', foodId: 'f5', amountGrams: 45, kcal: 3, protein: 0.2, fat: 0, carb: 0.4, salt: 0 },
  { date: '2026-08-11', mealType: 'snack', foodId: 'missing', amountGrams: 10, kcal: 7, protein: 0.1, fat: 0.1, carb: 0.3, salt: 0 },
  { date: '2026-08-11', mealType: 'custom_type', foodId: 'f4', kcal: 100, protein: 1, fat: 1, carb: 1, salt: 0.1 },
];

test('buildDaySection: 合計行・固有栄養素行・食事内容付きの区分別行を朝食→昼食→夕食の順で出す', () => {
  assert.equal(
    buildDaySection(meals, '2026-08-10', foodNames),
    [
      '## カロリー記録',
      '',
      '- 合計: 1234kcal (たんぱく質60.2g / 脂質30.1g / 炭水化物150.3g / 塩分4.2g)',
      '- 固有栄養素: DHA 1117.8mg / EPA 527mg',
      '- 朝食: 320kcal — レタス 25g',
      '- 昼食: 450kcal — ごはん 150g',
      '- 夕食: 464kcal — 月花さば水煮 50g',
    ].join('\n')
  );
});

test('buildDaySection: 浮動小数点誤差が出ないよう表示時に丸める(0.2+0.1=0.3)', () => {
  const out = buildDaySection(meals, '2026-08-11', foodNames);
  // 0.2 + 0.1 + 1 (custom) = 1.3 のはずが、丸めていないと 1.2999999999999998 になる
  assert.match(out, /たんぱく質1\.3g/);
});

test('buildDaySection: 同じmealTypeは合算して食品を「、」で並べ、未知のmealTypeはラベルそのまま、extras無しの日は固有栄養素行を出さない', () => {
  const out = buildDaySection(meals, '2026-08-11', foodNames);
  assert.equal(
    out,
    [
      '## カロリー記録',
      '',
      '- 合計: 110kcal (たんぱく質1.3g / 脂質1.1g / 炭水化物1.7g / 塩分0.1g)',
      '- 間食: 10kcal — どら焼き 45g、不明な食品 10g',
      '- custom_type: 100kcal — えごま油',
    ].join('\n')
  );
});

test('buildDaySection: 食品マスタに無いfoodIdは「不明な食品」、amountGrams無しは量を省略', () => {
  const out = buildDaySection(meals, '2026-08-11', foodNames);
  assert.match(out, /不明な食品 10g/);
  assert.match(out, /えごま油$/m);
});

test('buildDaySection: その日のmealsが無ければnull', () => {
  assert.equal(buildDaySection(meals, '2026-01-01', foodNames), null);
});

test('buildFoodNames: foods未定義でも空Mapを返す', () => {
  assert.equal(buildFoodNames(undefined).size, 0);
  assert.equal(buildFoodNames([{ id: 'a', name: 'X' }]).get('a'), 'X');
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
