import test from 'node:test';
import assert from 'node:assert/strict';
import { searchDishes } from '../js/dishTable.js';

const TABLE = [
  { code: 'K009', group: 'ごはん', name: '親子丼', per100g: { kcal: 132.5, protein: 5.7, fat: 1.8, carb: 22.1, salt: 0.4 } },
  { code: 'K012', group: 'ごはん', name: 'カツ丼', per100g: { kcal: 176.2, protein: 6.2, fat: 6.3, carb: 21.8, salt: 0.6 } },
  { code: 'K039', group: '麺', name: 'かけうどん', per100g: { kcal: 45.0, protein: 1.5, fat: 0.3, carb: 8.9, salt: 0.4 } },
  { code: 'K045', group: '肉料理＿煮物・茹でる', name: '肉じゃが', per100g: { kcal: 78.0, protein: 4.3, fat: 1.3, carb: 11.7, salt: 1.2 } },
];

test('空クエリでは空配列を返す', () => {
  assert.deepEqual(searchDishes(TABLE, ''), []);
});

test('空白のみのクエリでは空配列を返す', () => {
  assert.deepEqual(searchDishes(TABLE, '   '), []);
});

test('料理名の部分一致で検索できる', () => {
  const results = searchDishes(TABLE, '丼');
  assert.equal(results.length, 2);
});

test('該当がなければ空配列を返す', () => {
  assert.deepEqual(searchDishes(TABLE, 'そんな料理はない'), []);
});

test('前方一致する品目を部分一致より先に返す', () => {
  const results = searchDishes(TABLE, '肉じゃが');
  assert.equal(results[0].name, '肉じゃが');
});

test('前方一致が後方にある品目より優先される', () => {
  const table = [
    { code: 'x1', group: 'a', name: '味噌カツ丼', per100g: {} },
    { code: 'x2', group: 'a', name: '丼物セット', per100g: {} },
  ];
  const results = searchDishes(table, '丼');
  assert.equal(results[0].code, 'x2');
});

test('limitで件数を打ち切る', () => {
  const table = Array.from({ length: 100 }, (_, i) => ({
    code: String(i), group: 'ごはん', name: `テスト料理${i}`, per100g: {},
  }));
  assert.equal(searchDishes(table, 'テスト').length, 50);
  assert.equal(searchDishes(table, 'テスト', 10).length, 10);
});

test('大文字小文字を区別しない', () => {
  const table = [{ code: 'x', group: 'a', name: 'BLTサンドイッチ', per100g: {} }];
  assert.equal(searchDishes(table, 'blt').length, 1);
});

test('前後の空白を無視して検索する', () => {
  assert.equal(searchDishes(TABLE, '  うどん  ').length, 1);
});

test('元の配列を書き換えない', () => {
  const original = [...TABLE];
  searchDishes(TABLE, '丼');
  assert.deepEqual(TABLE, original);
});
