const RECOGNITION_PROMPT = `この写真に写っている料理・食品をすべて特定してください。
各品目について、日本語のメニュー名、目視で推定した量(グラム)、その量に対する栄養値
(カロリーkcal・タンパク質g・脂質g・糖質g・塩分g)を推定してください。
食べ物が写っていない場合は items を空配列にしてください。`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          amountGrams: { type: 'number' },
          kcal: { type: 'number' },
          protein: { type: 'number' },
          fat: { type: 'number' },
          carb: { type: 'number' },
          salt: { type: 'number' },
        },
        required: ['name', 'amountGrams', 'kcal', 'protein', 'fat', 'carb', 'salt'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

export function buildRecognitionRequest(base64Data, mediaType) {
  return {
    model: 'claude-opus-5',
    max_tokens: 4096,
    output_config: { format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
          { type: 'text', text: RECOGNITION_PROMPT },
        ],
      },
    ],
  };
}

export function parseRecognitionResponse(responseJson) {
  if (responseJson.stop_reason === 'refusal') {
    throw new Error('この写真は認識できませんでした。別の写真でお試しください。');
  }
  const textBlock = (responseJson.content || []).find((b) => b.type === 'text');
  if (!textBlock) throw new Error('認識結果を取得できませんでした。');
  return JSON.parse(textBlock.text);
}

export function validateItems(items) {
  if (!Array.isArray(items)) return [];
  const numericKeys = ['amountGrams', 'kcal', 'protein', 'fat', 'carb', 'salt'];
  return items.filter((item) => {
    if (!item || typeof item.name !== 'string' || item.name.trim() === '') return false;
    return numericKeys.every((key) => typeof item[key] === 'number' && Number.isFinite(item[key]) && item[key] >= 0);
  });
}

export function foodFromItem(item) {
  // amountGramsが0のときは換算不能なのでper100gを全て0にする(0除算でNaN/Infinityを出さない)。
  const ratio = item.amountGrams > 0 ? 100 / item.amountGrams : 0;
  const round1 = (v) => Math.round(v * ratio * 10) / 10;
  return {
    name: item.name,
    source: 'photo',
    per100g: {
      kcal: Math.round(item.kcal * ratio),
      protein: round1(item.protein),
      fat: round1(item.fat),
      carb: round1(item.carb),
      salt: round1(item.salt),
    },
  };
}

export async function recognizePhoto(apiKey, base64Data, mediaType) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(buildRecognitionRequest(base64Data, mediaType)),
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('APIキーが無効です。設定タブで確認してください。');
    throw new Error(`認識リクエストが失敗しました(HTTP ${response.status})。`);
  }
  const json = await response.json();
  const parsed = parseRecognitionResponse(json);
  return validateItems(parsed.items);
}
