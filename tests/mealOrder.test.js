import test from 'node:test';
import assert from 'node:assert/strict';
import { sortMealsForDisplay, assignOrder } from '../js/mealOrder.js';

test('sortMealsForDisplay: orderが無ければid順(登録順)', () => {
  const meals = [{ id: 3 }, { id: 1 }, { id: 2 }];
  assert.deepEqual(sortMealsForDisplay(meals).map((m) => m.id), [1, 2, 3]);
});

test('sortMealsForDisplay: orderがあればorder順', () => {
  const meals = [{ id: 1, order: 2 }, { id: 2, order: 0 }, { id: 3, order: 1 }];
  assert.deepEqual(sortMealsForDisplay(meals).map((m) => m.id), [2, 3, 1]);
});

test('sortMealsForDisplay: 並べ替え後に追加したorder無しの記録は末尾に来る', () => {
  const meals = [{ id: 1, order: 1 }, { id: 2, order: 0 }, { id: 9 }];
  assert.deepEqual(sortMealsForDisplay(meals).map((m) => m.id), [2, 1, 9]);
});

test('sortMealsForDisplay: 元の配列を変更しない', () => {
  const meals = [{ id: 2 }, { id: 1 }];
  sortMealsForDisplay(meals);
  assert.deepEqual(meals.map((m) => m.id), [2, 1]);
});

test('assignOrder: 指定したid順に0からorderを振り、変わったものだけ返す', () => {
  const meals = [{ id: 1, order: 0, kcal: 10 }, { id: 2, order: 1 }, { id: 3 }];
  const changed = assignOrder(meals, [2, 1, 3]);
  assert.deepEqual(changed, [
    { id: 2, order: 0 },
    { id: 1, order: 1, kcal: 10 },
    { id: 3, order: 2 },
  ]);
});

test('assignOrder: 順番が変わらなければ何も返さない', () => {
  const meals = [{ id: 1, order: 0 }, { id: 2, order: 1 }];
  assert.deepEqual(assignOrder(meals, [1, 2]), []);
});
