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

    // 量を修正したら栄養値も認識時の推定値から比例換算して追従させる
    // (既存の手入力フォームで量を変えるとプレビューが再計算されるのと同じ挙動)。
    // 栄養値を個別に手修正したい場合は、量を確定させた後に直すことになる。
    modalRoot.querySelector('.photo-item-list').addEventListener('input', (event) => {
      const amountInput = event.target.closest('.photo-item-field[data-field="amountGrams"]');
      if (!amountInput) return;
      const row = amountInput.closest('.photo-item');
      const original = items[Number(row.dataset.index)];
      if (!original || !(original.amountGrams > 0)) return;
      const ratio = Number(amountInput.value) / original.amountGrams;
      if (!Number.isFinite(ratio) || ratio < 0) return;
      for (const field of row.querySelectorAll('.photo-item-field')) {
        const key = field.dataset.field;
        if (key === 'amountGrams') continue;
        const decimals = key === 'kcal' ? 1 : 10;
        field.value = Math.round(original[key] * ratio * decimals) / decimals;
      }
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
