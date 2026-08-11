import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcNutrientsForAmount,
  sumNutrients,
  calcProgress,
  calcExtrasForAmount,
  sumExtras,
} from '../js/nutrition.js';

test('calcNutrientsForAmount: 100gちょうどは per100g の値と同じ', () => {
  const per100g = { kcal: 156, protein: 2.5, fat: 0.3, carb: 37.1, salt: 0 };
  const result = calcNutrientsForAmount(per100g, 100);
  assert.deepEqual(result, { kcal: 156, protein: 2.5, fat: 0.3, carb: 37.1, salt: 0 });
});

test('calcNutrientsForAmount: 150gは1.5倍で計算される', () => {
  const per100g = { kcal: 200, protein: 10, fat: 4, carb: 20, salt: 1 };
  const result = calcNutrientsForAmount(per100g, 150);
  assert.deepEqual(result, { kcal: 300, protein: 15, fat: 6, carb: 30, salt: 1.5 });
});

test('calcNutrientsForAmount: 0gは全て0になる(0除算を含まない)', () => {
  const per100g = { kcal: 200, protein: 10, fat: 4, carb: 20, salt: 1 };
  const result = calcNutrientsForAmount(per100g, 0);
  assert.deepEqual(result, { kcal: 0, protein: 0, fat: 0, carb: 0, salt: 0 });
});

test('sumNutrients: 複数の記録を合計できる', () => {
  const list = [
    { kcal: 100, protein: 5, fat: 2, carb: 10, salt: 0.5 },
    { kcal: 200, protein: 10, fat: 4, carb: 20, salt: 1.0 },
  ];
  assert.deepEqual(sumNutrients(list), { kcal: 300, protein: 15, fat: 6, carb: 30, salt: 1.5 });
});

test('sumNutrients: 空配列は全て0', () => {
  assert.deepEqual(sumNutrients([]), { kcal: 0, protein: 0, fat: 0, carb: 0, salt: 0 });
});

test('calcProgress: 目標の半分なら50%', () => {
  assert.equal(calcProgress(900, 1800), 50);
});

test('calcProgress: 目標が0以下なら0を返す(0除算を防ぐ)', () => {
  assert.equal(calcProgress(500, 0), 0);
  assert.equal(calcProgress(500, -10), 0);
});

test('calcProgress: 目標を超えたら100を超える値を返す', () => {
  assert.equal(calcProgress(2000, 1800), 111);
});

test('calcExtrasForAmount: 100gちょうどは per100g の値と同じ', () => {
  const extraNutrients = [{ name: 'DHA', unit: 'mg', per100g: 860 }];
  assert.deepEqual(calcExtrasForAmount(extraNutrients, 100), [
    { name: 'DHA', unit: 'mg', amount: 860 },
  ]);
});

test('calcExtrasForAmount: 150gは1.5倍・小数第1位に丸める', () => {
  const extraNutrients = [
    { name: 'DHA', unit: 'mg', per100g: 860 },
    { name: 'ポリフェノール', unit: 'mg', per100g: 33.3 },
  ];
  assert.deepEqual(calcExtrasForAmount(extraNutrients, 150), [
    { name: 'DHA', unit: 'mg', amount: 1290 },
    { name: 'ポリフェノール', unit: 'mg', amount: 50 },
  ]);
});

test('calcExtrasForAmount: undefinedや空配列は空配列を返す', () => {
  assert.deepEqual(calcExtrasForAmount(undefined, 100), []);
  assert.deepEqual(calcExtrasForAmount([], 100), []);
});

test('calcExtrasForAmount: 0gは全て0になる', () => {
  const extraNutrients = [{ name: 'EPA', unit: 'mg', per100g: 930 }];
  assert.deepEqual(calcExtrasForAmount(extraNutrients, 0), [
    { name: 'EPA', unit: 'mg', amount: 0 },
  ]);
});

test('sumExtras: 同じ名前を合算し五十音順に並べる', () => {
  const meals = [
    { extras: [{ name: 'DHA', unit: 'mg', amount: 500 }] },
    { extras: [
      { name: 'ポリフェノール', unit: 'mg', amount: 120 },
      { name: 'DHA', unit: 'mg', amount: 350.5 },
    ] },
  ];
  assert.deepEqual(sumExtras(meals), [
    { name: 'DHA', unit: 'mg', amount: 850.5 },
    { name: 'ポリフェノール', unit: 'mg', amount: 120 },
  ]);
});

test('sumExtras: extrasが無い食事と混在しても落ちない', () => {
  const meals = [
    { kcal: 500 },
    { kcal: 300, extras: [{ name: 'ALA', unit: 'g', amount: 1.2 }] },
  ];
  assert.deepEqual(sumExtras(meals), [{ name: 'ALA', unit: 'g', amount: 1.2 }]);
});

test('sumExtras: 全食事にextrasが無ければ空配列', () => {
  assert.deepEqual(sumExtras([{ kcal: 100 }, {}]), []);
});

test('sumExtras: 浮動小数の合算も小数第1位に丸める', () => {
  const meals = [
    { extras: [{ name: 'EPA', unit: 'mg', amount: 0.1 }] },
    { extras: [{ name: 'EPA', unit: 'mg', amount: 0.2 }] },
  ];
  assert.deepEqual(sumExtras(meals), [{ name: 'EPA', unit: 'mg', amount: 0.3 }]);
});
