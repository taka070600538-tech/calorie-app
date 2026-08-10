import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRecognitionRequest,
  parseRecognitionResponse,
  validateItems,
  foodFromItem,
} from '../js/photoRecognition.js';

test('buildRecognitionRequest: モデル・画像・構造化出力を含むリクエストを構築する', () => {
  const req = buildRecognitionRequest('BASE64DATA', 'image/jpeg');
  assert.equal(req.model, 'claude-opus-5');
  assert.ok(req.max_tokens >= 1024);
  const imageBlock = req.messages[0].content.find((b) => b.type === 'image');
  assert.equal(imageBlock.source.type, 'base64');
  assert.equal(imageBlock.source.media_type, 'image/jpeg');
  assert.equal(imageBlock.source.data, 'BASE64DATA');
  assert.equal(req.output_config.format.type, 'json_schema');
  const schema = req.output_config.format.schema;
  assert.equal(schema.properties.items.type, 'array');
  assert.equal(schema.additionalProperties, false);
});

test('parseRecognitionResponse: textブロックのJSONからitemsを取り出す', () => {
  const responseJson = {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: '{"items":[{"name":"白ごはん","amountGrams":150,"kcal":234,"protein":3.8,"fat":0.5,"carb":53.4,"salt":0}]}' }],
  };
  const result = parseRecognitionResponse(responseJson);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].name, '白ごはん');
});

test('parseRecognitionResponse: refusal は Error を投げる', () => {
  const responseJson = { stop_reason: 'refusal', content: [] };
  assert.throws(() => parseRecognitionResponse(responseJson), /認識できませんでした/);
});

test('parseRecognitionResponse: textブロックが無ければ Error を投げる', () => {
  const responseJson = { stop_reason: 'end_turn', content: [] };
  assert.throws(() => parseRecognitionResponse(responseJson));
});

test('validateItems: 正常な項目はそのまま通す', () => {
  const items = [{ name: '味噌汁', amountGrams: 180, kcal: 40, protein: 3, fat: 1.2, carb: 4.5, salt: 1.5 }];
  const result = validateItems(items);
  assert.equal(result.length, 1);
});

test('validateItems: name空・数値が負・数値でない項目は除外する', () => {
  const items = [
    { name: '', amountGrams: 100, kcal: 100, protein: 1, fat: 1, carb: 1, salt: 0 },
    { name: '謎の料理', amountGrams: -5, kcal: 100, protein: 1, fat: 1, carb: 1, salt: 0 },
    { name: '謎の料理2', amountGrams: 100, kcal: 'abc', protein: 1, fat: 1, carb: 1, salt: 0 },
    { name: '正常', amountGrams: 100, kcal: 100, protein: 1, fat: 1, carb: 1, salt: 0.1 },
  ];
  const result = validateItems(items);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, '正常');
});

test('validateItems: 配列でなければ空配列を返す', () => {
  assert.deepEqual(validateItems(undefined), []);
  assert.deepEqual(validateItems(null), []);
  assert.deepEqual(validateItems('x'), []);
});

test('foodFromItem: per100g換算した食品レコードを作る', () => {
  const item = { name: 'カレーライス', amountGrams: 400, kcal: 800, protein: 20, fat: 24, carb: 120, salt: 3.2 };
  const food = foodFromItem(item);
  assert.equal(food.name, 'カレーライス');
  assert.equal(food.source, 'photo');
  assert.equal(food.per100g.kcal, 200);
  assert.equal(food.per100g.protein, 5);
  assert.equal(food.per100g.fat, 6);
  assert.equal(food.per100g.carb, 30);
  assert.equal(food.per100g.salt, 0.8);
});

test('foodFromItem: amountGramsが0なら per100g は全て0', () => {
  const item = { name: 'x', amountGrams: 0, kcal: 100, protein: 1, fat: 1, carb: 1, salt: 1 };
  const food = foodFromItem(item);
  assert.equal(food.per100g.kcal, 0);
});
