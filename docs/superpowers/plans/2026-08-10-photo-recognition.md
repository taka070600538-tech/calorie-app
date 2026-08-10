# 写真からの食事記録機能 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** スマホで撮影した料理写真からClaude Vision APIでメニュー名・量・栄養値を推定し、確認・編集して食事記録に保存できるようにする。

**Architecture:** 純粋ロジック（リクエスト構築・レスポンス検証・per100g換算）を `js/photoRecognition.js` に分離してユニットテスト可能にし、UI（カメラ起動→認識中表示→確認モーダル→保存）を `js/photoMealForm.js` に置く。既存の `render.js` の食事セクションに📷ボタンを追加し、`app.js` でバインドする。APIキーはlocalStorageに保存（バックアップはIndexedDBのfoods/meals/goalsのみを対象とするため、自然にバックアップ対象外になる）。

**Tech Stack:** ビルドなし静的PWA（ESモジュール）、IndexedDB、Claude API（raw fetch、`claude-opus-5`、Vision + structured outputs）、node --test

**Spec:** `docs/superpowers/specs/2026-08-10-photo-recognition-design.md`

## Global Constraints

- ビルド工程なし。npm依存を追加しない。ESモジュールのブラウザ直接読み込み。
- モデルIDは `claude-opus-5` 固定。
- APIヘッダー: `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`, `anthropic-dangerous-direct-browser-access: true`
- 既存コードのスタイル（日本語UI文言、コメントは制約説明のみ、テストは node:test + assert）に合わせる。
- JS/CSSを変更するので、最後に `sw.js` の `CACHE_NAME` を `calorie-app-v9` に上げ、新規JSファイルをASSETSに追加する。
- テスト実行コマンド: `node --test tests/*.test.js`（リポジトリルートで実行）

---

### Task 1: photoRecognition.js の純粋ロジック + テスト

**Files:**
- Create: `js/photoRecognition.js`
- Create: `tests/photoRecognition.test.js`

**Interfaces:**
- Produces（Task 2, 3 が使う）:
  - `buildRecognitionRequest(base64Data, mediaType)` → Claude API リクエストボディ（object）
  - `parseRecognitionResponse(responseJson)` → `{items: [...]}` を返す。不正なら Error を throw
  - `validateItems(items)` → 検証済み items 配列を返す。不正項目は除外
  - `foodFromItem(item)` → `{name, per100g: {kcal, protein, fat, carb, salt}, source: 'photo'}` per100g換算済み
  - `RECOGNITION_SYSTEM_PROMPT`（string, export不要だがリクエスト内に含める）

- [ ] **Step 1: 失敗するテストを書く**

`tests/photoRecognition.test.js`:

```js
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
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/photoRecognition.test.js`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装を書く**

`js/photoRecognition.js`:

```js
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
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test tests/photoRecognition.test.js`
Expected: 全件PASS

- [ ] **Step 5: 既存テストも壊れていないことを確認してコミット**

Run: `node --test tests/*.test.js`
Expected: 全件PASS

```bash
git add js/photoRecognition.js tests/photoRecognition.test.js
git commit -m "feat: 写真認識の純粋ロジック(リクエスト構築・検証・per100g換算)を追加"
```

---

### Task 2: APIキー設定UI（settings.js）

**Files:**
- Modify: `js/settings.js`

**Interfaces:**
- Produces: localStorage キー `anthropic-api-key`（Task 3 が読む）

- [ ] **Step 1: settings.js にAPIキー欄を追加**

`js/settings.js` の `renderSettingsView` で、`container.innerHTML` の `</form>` の後（backupSection追加の前）に写真認識セクションを追加する。既存フォームのHTML末尾に以下を続ける形にする:

```js
// container.innerHTML のテンプレートの末尾(既存の</form>の後)に追記:
    <div class="photo-api-section">
      <h3 class="settings-heading">写真からの食事記録(AI認識)</h3>
      <label>Anthropic APIキー
        <input type="password" id="anthropic-api-key" placeholder="sk-ant-..." autocomplete="off">
      </label>
      <button type="button" id="save-api-key">APIキーを保存</button>
      <button type="button" id="clear-api-key">削除</button>
      <span id="api-key-saved-msg" class="hidden">保存しました</span>
      <p class="settings-note">キーは端末内(localStorage)にのみ保存され、GitHubバックアップには含まれません。写真認識時のみAnthropicに画像が送信されます。</p>
    </div>
```

イベントバインド（既存の `form.addEventListener` の後に追加）:

```js
  const apiKeyInput = container.querySelector('#anthropic-api-key');
  const apiKeySavedMsg = container.querySelector('#api-key-saved-msg');
  apiKeyInput.value = localStorage.getItem('anthropic-api-key') || '';

  container.querySelector('#save-api-key').addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (!key) return;
    localStorage.setItem('anthropic-api-key', key);
    apiKeySavedMsg.classList.remove('hidden');
    setTimeout(() => apiKeySavedMsg.classList.add('hidden'), 2000);
  });

  container.querySelector('#clear-api-key').addEventListener('click', () => {
    localStorage.removeItem('anthropic-api-key');
    apiKeyInput.value = '';
  });
```

- [ ] **Step 2: 動作確認（目視）**

Run: `python -m http.server 8801`（リポジトリルートで）
ブラウザで `http://localhost:8801/` → 設定タブ → APIキー欄が表示され、保存→リロード→値が残る、削除→空になることを確認。

- [ ] **Step 3: コミット**

```bash
git add js/settings.js
git commit -m "feat: 設定タブにAnthropic APIキーの保存欄を追加"
```

---

### Task 3: 写真認識UI（photoMealForm.js + render.js + app.js + style.css）

**Files:**
- Create: `js/photoMealForm.js`
- Modify: `js/render.js`（📷ボタン追加）
- Modify: `js/app.js`（バインド追加）
- Modify: `style.css`（確認モーダルの最小スタイル）

**Interfaces:**
- Consumes: Task 1 の `recognizePhoto(apiKey, base64Data, mediaType)`, `foodFromItem(item)`; 既存 `db.js` の `addMeal(db, meal)`, `addFood(db, food)`, `getAllFoods(db)`; 既存 `render.js` の `escapeHtml`, `MEAL_TYPE_LABELS`
- Produces: `openPhotoMealForm({ modalRoot, db, mealType, date, foods, onSaved })`（app.js が呼ぶ）

- [ ] **Step 1: render.js に📷ボタンを追加**

`renderMealSection` 内の追加ボタンの隣（`.meal-section-header` 内）:

```js
      <div class="meal-section-buttons">
        <button class="photo-meal-btn" data-action="photo-meal" data-meal-type="${mealType}">📷 写真</button>
        <button class="add-meal-btn" data-action="add-meal" data-meal-type="${mealType}">＋ 追加</button>
      </div>
```

（既存の `<button class="add-meal-btn" ...>` を `meal-section-buttons` divで包む形に変更）

- [ ] **Step 2: photoMealForm.js を実装**

```js
import { recognizePhoto, foodFromItem } from './photoRecognition.js';
import { addMeal, addFood } from './db.js';
import { escapeHtml, MEAL_TYPE_LABELS } from './render.js';

// スマホ写真は数MBあるため縮小してから送る(通信量とAPIコスト対策)。
const MAX_LONG_EDGE = 1568;

async function fileToResizedBase64(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return dataUrl.split(',')[1];
}

export function openPhotoMealForm({ modalRoot, db, mealType, date, foods, onSaved }) {
  const apiKey = localStorage.getItem('anthropic-api-key');
  if (!apiKey) {
    alert('写真認識を使うには、設定タブでAnthropic APIキーを登録してください。');
    return;
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    showLoading();
    try {
      const base64 = await fileToResizedBase64(file);
      const items = await recognizePhoto(apiKey, base64, 'image/jpeg');
      if (items.length === 0) {
        closeModal();
        alert('料理を認識できませんでした。別の写真でお試しください。');
        return;
      }
      showConfirm(items);
    } catch (err) {
      closeModal();
      alert(err.message || '写真の認識に失敗しました。');
    }
  });
  input.click();

  function showLoading() {
    modalRoot.innerHTML = `
      <div class="modal-overlay">
        <div class="modal">
          <h2>${MEAL_TYPE_LABELS[mealType]}を写真から追加</h2>
          <p class="photo-loading">写真を解析しています…</p>
        </div>
      </div>
    `;
  }

  function showConfirm(items) {
    const rowsHtml = items
      .map((item, i) => `
        <li class="photo-item" data-index="${i}">
          <div class="photo-item-head">
            <input type="text" class="photo-item-name" value="${escapeHtml(item.name)}">
            <button type="button" class="photo-item-remove" data-action="remove-item">削除</button>
          </div>
          <div class="photo-item-grid">
            <label>量(g)<input type="number" class="photo-item-field" data-field="amountGrams" value="${item.amountGrams}" min="0" step="1"></label>
            <label>kcal<input type="number" class="photo-item-field" data-field="kcal" value="${item.kcal}" min="0" step="1"></label>
            <label>タンパク質(g)<input type="number" class="photo-item-field" data-field="protein" value="${item.protein}" min="0" step="0.1"></label>
            <label>脂質(g)<input type="number" class="photo-item-field" data-field="fat" value="${item.fat}" min="0" step="0.1"></label>
            <label>糖質(g)<input type="number" class="photo-item-field" data-field="carb" value="${item.carb}" min="0" step="0.1"></label>
            <label>塩分(g)<input type="number" class="photo-item-field" data-field="salt" value="${item.salt}" min="0" step="0.1"></label>
          </div>
        </li>
      `)
      .join('');

    modalRoot.innerHTML = `
      <div class="modal-overlay">
        <div class="modal photo-confirm-modal">
          <h2>${MEAL_TYPE_LABELS[mealType]}を写真から追加</h2>
          <p class="settings-note">推定値です。必要に応じて修正してください。</p>
          <ul class="photo-item-list">${rowsHtml}</ul>
          <div class="modal-actions">
            <button type="button" id="photo-save">この内容で記録</button>
            <button type="button" id="photo-cancel">キャンセル</button>
          </div>
        </div>
      </div>
    `;

    modalRoot.querySelector('.photo-item-list').addEventListener('click', (event) => {
      const btn = event.target.closest('[data-action="remove-item"]');
      if (btn) btn.closest('.photo-item').remove();
    });

    modalRoot.querySelector('#photo-cancel').addEventListener('click', closeModal);
    modalRoot.querySelector('#photo-save').addEventListener('click', async () => {
      const rows = [...modalRoot.querySelectorAll('.photo-item')];
      const edited = rows
        .map((row) => {
          const item = { name: row.querySelector('.photo-item-name').value.trim() };
          for (const field of row.querySelectorAll('.photo-item-field')) {
            item[field.dataset.field] = Number(field.value);
          }
          return item;
        })
        .filter((item) => item.name !== '' && item.amountGrams > 0);
      if (edited.length === 0) {
        closeModal();
        return;
      }
      await saveItems(edited);
      closeModal();
      onSaved();
    });
  }

  async function saveItems(items) {
    for (const item of items) {
      // 同名の登録済み食品があれば流用し、無ければ食品DBにも登録して次回から検索で使えるようにする。
      const existing = foods.find((f) => f.name === item.name);
      let foodId;
      if (existing) {
        foodId = existing.id;
      } else {
        const food = foodFromItem(item);
        foodId = await addFood(db, food);
        foods.push({ ...food, id: foodId });
      }
      await addMeal(db, {
        date,
        mealType,
        foodId,
        amountGrams: item.amountGrams,
        kcal: item.kcal,
        protein: item.protein,
        fat: item.fat,
        carb: item.carb,
        salt: item.salt,
      });
    }
  }

  function closeModal() {
    modalRoot.innerHTML = '';
  }
}
```

- [ ] **Step 3: app.js にバインドを追加**

`bindMealActions` 内、`add-meal` の分岐の後に追加:

```js
    const photoBtn = event.target.closest('[data-action="photo-meal"]');
    if (photoBtn) {
      openPhotoMealForm({
        modalRoot: document.getElementById('modal-root'),
        db: state.db,
        mealType: photoBtn.dataset.mealType,
        date: state.date,
        foods: state.foods,
        onSaved: refreshDashboard,
      });
      return;
    }
```

import追加: `import { openPhotoMealForm } from './photoMealForm.js';`

- [ ] **Step 4: style.css にスタイル追加**

既存の `.modal` / `.meal-section-header` のスタイルに合わせて追加（既存クラスの定義を確認して調和させる）:

```css
.meal-section-buttons {
  display: flex;
  gap: 8px;
}

.photo-item-list {
  list-style: none;
  padding: 0;
  margin: 12px 0;
  max-height: 60vh;
  overflow-y: auto;
}

.photo-item {
  border: 1px solid var(--border-color, #ddd);
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 10px;
}

.photo-item-head {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.photo-item-name {
  flex: 1;
}

.photo-item-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  font-size: 0.85rem;
}

.photo-item-grid input {
  width: 100%;
}

.photo-loading {
  padding: 16px 0;
}
```

（`var(--border-color, #ddd)` は既存CSSにCSS変数が無ければ `#ddd` 直書きに変える。既存style.cssの流儀に合わせること。）

- [ ] **Step 5: テスト全件と目視確認**

Run: `node --test tests/*.test.js`
Expected: 全件PASS

ブラウザ確認（`python -m http.server 8801`）: 📷ボタンが4セクションに表示される。APIキー未設定でタップ→案内アラート。（実際のAPI呼び出しは後の検証フェーズで実施）

- [ ] **Step 6: コミット**

```bash
git add js/photoMealForm.js js/render.js js/app.js style.css
git commit -m "feat: 写真からの食事記録UI(カメラ起動・確認モーダル・保存)を追加"
```

---

### Task 4: Service Worker更新 + README

**Files:**
- Modify: `sw.js`
- Modify: `README.md`

- [ ] **Step 1: sw.js 更新**

- `CACHE_NAME` を `'calorie-app-v9'` に変更
- `ASSETS` に `'./js/photoRecognition.js'` と `'./js/photoMealForm.js'` を追加

- [ ] **Step 2: README.md に機能説明を追記**

「バックアップと復元」セクションの後に追加:

```markdown
## 写真からの食事記録(AI認識)

設定タブでAnthropic APIキー(https://platform.claude.com/ で発行)を保存すると、
「今日の記録」の各食事の「📷 写真」ボタンから、料理写真を撮影してメニュー名・量・
栄養値をAIで推定し、確認・修正して記録できる。認識した料理は食品一覧にも自動登録され、
次回から手入力検索でも使える。

- キーは端末内(localStorage)にのみ保存され、GitHubバックアップには含まれない
- 写真は認識に使うだけで保存されない。認識時のみAnthropic APIに画像が送信される
- 費用はAnthropicのAPI利用料として1回あたり数円程度(モデル: claude-opus-5)
```

- [ ] **Step 3: テスト全件確認とコミット**

Run: `node --test tests/*.test.js`
Expected: 全件PASS（pwaAssets.test.js がsw.jsのASSETS整合性を検証している可能性があるため必ず実行）

```bash
git add sw.js README.md
git commit -m "docs: 写真認識機能のREADME追記とService Workerキャッシュ更新"
```
