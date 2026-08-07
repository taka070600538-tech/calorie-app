import test from 'node:test';
import assert from 'node:assert/strict';
import { searchFoods } from '../js/foodSearch.js';

const foods = [
  { id: 'rice_cooked', name: '白米(めし)' },
  { id: 'bread', name: '食ぱん' },
  { id: 'udon_boiled', name: 'うどん(ゆで)' },
];

test('searchFoods: 部分一致する食品を返す', () => {
  const result = searchFoods(foods, '白米');
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'rice_cooked');
});

test('searchFoods: 空文字・空白のみは空配列を返す', () => {
  assert.deepEqual(searchFoods(foods, ''), []);
  assert.deepEqual(searchFoods(foods, '   '), []);
});

test('searchFoods: ヒットしない場合は空配列', () => {
  assert.deepEqual(searchFoods(foods, 'ラーメン'), []);
});

test('searchFoods: 複数ヒットする', () => {
  const result = searchFoods(foods, 'ん');
  assert.equal(result.length, 2);
});
