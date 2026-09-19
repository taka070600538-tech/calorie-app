// 1回の撮影で扱うのは中心の皿1つだけ。材料や端に映る食品に分解せず、1つの料理メニューとして返させる。
// 量(g)は写真からの推定誤差が大きいため AI には推定させず、栄養値は100gあたりで返させて
// アプリ側で仮の量100gを付ける(ユーザーが実測した皿の重量に修正すると比例換算される)。
const RECOGNITION_PROMPT = `この写真の中心にある皿(器)1つだけを対象にしてください。
その皿に盛られた料理を、材料や部品に分解せず、1つの料理メニューとして1品だけ特定してください
(品名は代表的なメニュー名でよく、多少ずれていても構いません)。
端に映り込んだ別の皿・付け合わせ・飲み物・調味料などは無視してください。
その料理の日本語のメニュー名と、100gあたりの栄養値
(カロリーkcal・タンパク質g・脂質g・糖質g・塩分g)を推定してください。
量(グラム)は推定しないでください。
食べ物が写っていない場合は items を空配列にしてください。`;

// アプリ側で付ける仮の量。ユーザーが確認画面で実測値に修正する前提の形式的な値。
export const PLACEHOLDER_GRAMS = 100;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      maxItems: 1,
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          kcal: { type: 'number' },
          protein: { type: 'number' },
          fat: { type: 'number' },
          carb: { type: 'number' },
          salt: { type: 'number' },
        },
        required: ['name', 'kcal', 'protein', 'fat', 'carb', 'salt'],
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

// 有効な先頭1品だけを返し、量は常に PLACEHOLDER_GRAMS(100g)で上書きする。
// 栄養値は100gあたりの推定値なので、そのまま「100gぶんの栄養値」として扱える。
export function validateItems(items) {
  if (!Array.isArray(items)) return [];
  const numericKeys = ['kcal', 'protein', 'fat', 'carb', 'salt'];
  const first = items.find((item) => {
    if (!item || typeof item.name !== 'string' || item.name.trim() === '') return false;
    return numericKeys.every((key) => typeof item[key] === 'number' && Number.isFinite(item[key]) && item[key] >= 0);
  });
  if (!first) return [];
  return [{
    name: first.name,
    amountGrams: PLACEHOLDER_GRAMS,
    kcal: first.kcal,
    protein: first.protein,
    fat: first.fat,
    carb: first.carb,
    salt: first.salt,
  }];
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
