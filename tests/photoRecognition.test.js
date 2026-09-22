import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRecognitionRequest,
  parseRecognitionResponse,
  validateItems,
  foodFromItem,
  formatRequestError,
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

test('buildRecognitionRequest: 応答は1皿1品のみ・量(g)はAIに推定させない', () => {
  const req = buildRecognitionRequest('BASE64DATA', 'image/jpeg');
  const schema = req.output_config.format.schema;
  // Anthropicの構造化出力は配列の件数制約(maxItems等)に未対応でHTTP 400になる。
  // 1件に絞るのはアプリ側(validateItems)で行う。
  assert.ok(!('maxItems' in schema.properties.items), 'maxItemsはAPIが拒否するので使わない');
  const itemProps = schema.properties.items.items.properties;
  assert.ok(!('amountGrams' in itemProps), '量はAIに推定させない');
  assert.deepEqual(schema.properties.items.items.required, ['name', 'kcal', 'protein', 'fat', 'carb', 'salt']);
  const prompt = req.messages[0].content.find((b) => b.type === 'text').text;
  assert.match(prompt, /中心/);
  assert.match(prompt, /1品|一品|1つ/);
  assert.match(prompt, /100g|100グラム/);
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

test('validateItems: 正常な項目に仮の量100gを付けて返す', () => {
  const items = [{ name: '味噌汁', kcal: 22, protein: 1.7, fat: 0.7, carb: 2.5, salt: 0.8 }];
  const result = validateItems(items);
  assert.equal(result.length, 1);
  assert.equal(result[0].amountGrams, 100);
  assert.equal(result[0].name, '味噌汁');
  assert.equal(result[0].kcal, 22);
});

test('validateItems: AIが量を返してきても100gで上書きする', () => {
  const items = [{ name: 'カレーライス', amountGrams: 450, kcal: 180, protein: 4, fat: 6, carb: 28, salt: 0.9 }];
  const result = validateItems(items);
  assert.equal(result[0].amountGrams, 100);
});

test('validateItems: 複数返ってきても先頭の1品だけにする', () => {
  const items = [
    { name: 'ハンバーグ', kcal: 220, protein: 13, fat: 15, carb: 8, salt: 1.1 },
    { name: 'にんじん', kcal: 35, protein: 0.7, fat: 0.1, carb: 6, salt: 0 },
  ];
  const result = validateItems(items);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'ハンバーグ');
});

test('validateItems: name空・数値が負・数値でない項目は除外する', () => {
  const items = [
    { name: '', kcal: 100, protein: 1, fat: 1, carb: 1, salt: 0 },
    { name: '謎の料理', kcal: -5, protein: 1, fat: 1, carb: 1, salt: 0 },
    { name: '謎の料理2', kcal: 'abc', protein: 1, fat: 1, carb: 1, salt: 0 },
    { name: '正常', kcal: 100, protein: 1, fat: 1, carb: 1, salt: 0.1 },
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

test('formatRequestError: 401はAPIキー無効の案内', () => {
  assert.match(formatRequestError(401, null), /APIキーが無効/);
});

test('formatRequestError: APIのエラー本文があればHTTPコードとメッセージを含める', () => {
  const body = { type: 'error', error: { type: 'invalid_request_error', message: 'maxItems is not supported' } };
  const msg = formatRequestError(400, body);
  assert.match(msg, /HTTP 400/);
  assert.match(msg, /maxItems is not supported/);
});

test('formatRequestError: エラー本文が無ければHTTPコードのみ', () => {
  const msg = formatRequestError(500, null);
  assert.match(msg, /HTTP 500/);
  assert.ok(!/undefined/.test(msg));
});
