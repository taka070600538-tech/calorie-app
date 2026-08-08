import test from 'node:test';
import assert from 'node:assert/strict';
import { searchMextFoods } from '../js/mextTable.js';

const TABLE = [
  { code: '01088', group: '穀類', name: 'こめ ［水稲めし］ 精白米 うるち米', per100g: { kcal: 156, protein: 2.5, fat: 0.3, carb: 35.6, salt: 0 } },
  { code: '01083', group: '穀類', name: 'こめ ［水稲穀粒］ 精白米 うるち米', per100g: { kcal: 342, protein: 6.1, fat: 0.9, carb: 77.1, salt: 0 } },
  { code: '06182', group: '野菜類', name: '（トマト類） 赤色トマト 果実 生', per100g: { kcal: 20, protein: 0.7, fat: 0.1, carb: 3.7, salt: 0 } },
  { code: '11220', group: '肉類', name: '＜畜肉類＞ ぶた ロース 生', per100g: { kcal: 248, protein: 19.3, fat: 19.2, carb: 0.2, salt: 0.1 } },
];

test('空クエリでは空配列を返す', () => {
  assert.deepEqual(searchMextFoods(TABLE, ''), []);
});

test('空白のみのクエリでは空配列を返す', () => {
  assert.deepEqual(searchMextFoods(TABLE, '   '), []);
});

test('食品名の部分一致で検索できる', () => {
  const results = searchMextFoods(TABLE, '精白米');
  assert.equal(results.length, 2);
  assert.equal(results[0].group, '穀類');
});

test('該当がなければ空配列を返す', () => {
  assert.deepEqual(searchMextFoods(TABLE, 'そんな食品はない'), []);
});

test('前方一致する品目を部分一致より先に返す', () => {
  const results = searchMextFoods(TABLE, 'こめ');
  assert.equal(results.length, 2);
  assert.equal(results[0].name.startsWith('こめ'), true);
});

test('前方一致が後方にある品目より優先される', () => {
  const table = [
    { code: 'x1', group: 'a', name: '大根おろし', per100g: {} },
    { code: 'x2', group: 'a', name: 'おろし大根', per100g: {} },
  ];
  const results = searchMextFoods(table, 'おろし');
  assert.equal(results[0].code, 'x2');
});

test('limitで件数を打ち切る', () => {
  const table = Array.from({ length: 100 }, (_, i) => ({
    code: String(i), group: '穀類', name: `テスト食品${i}`, per100g: {},
  }));
  assert.equal(searchMextFoods(table, 'テスト').length, 50);
  assert.equal(searchMextFoods(table, 'テスト', 10).length, 10);
});

test('大文字小文字を区別しない', () => {
  const table = [{ code: 'x', group: 'a', name: 'Cheese ゴーダ', per100g: {} }];
  assert.equal(searchMextFoods(table, 'cheese').length, 1);
});

test('前後の空白を無視して検索する', () => {
  assert.equal(searchMextFoods(TABLE, '  トマト  ').length, 1);
});

test('元の配列を書き換えない', () => {
  const original = [...TABLE];
  searchMextFoods(TABLE, 'こめ');
  assert.deepEqual(TABLE, original);
});
