import { saveGoals } from './db.js';

export function renderSettingsView(container, db, goals, { onSaved } = {}) {
  container.innerHTML = `
    <h2>設定</h2>
    <form id="goals-form" class="goals-form">
      <h3 class="settings-heading">栄養目標</h3>
      <label>カロリー(kcal) <input type="number" id="goal-kcal" value="${goals.kcal}" min="0" step="1"></label>
      <label>タンパク質(g) <input type="number" id="goal-protein" value="${goals.protein}" min="0" step="0.1"></label>
      <label>脂質(g) <input type="number" id="goal-fat" value="${goals.fat}" min="0" step="0.1"></label>
      <label>糖質(g) <input type="number" id="goal-carb" value="${goals.carb}" min="0" step="0.1"></label>
      <label>塩分(g) <input type="number" id="goal-salt" value="${goals.salt}" min="0" step="0.1"></label>
      <h3 class="settings-heading">消費カロリー</h3>
      <label>1日の消費カロリー(kcal) <input type="number" id="goal-expenditure" value="${goals.expenditureKcal}" min="0" step="1"></label>
      <p class="settings-note">分析タブのカロリー収支と体脂肪換算の計算に使います。</p>
      <button type="submit">保存</button>
      <span id="goals-saved-msg" class="hidden">保存しました</span>
    </form>
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
  `;

  const form = container.querySelector('#goals-form');
  const savedMsg = container.querySelector('#goals-saved-msg');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const newGoals = {
      kcal: Number(container.querySelector('#goal-kcal').value),
      protein: Number(container.querySelector('#goal-protein').value),
      fat: Number(container.querySelector('#goal-fat').value),
      carb: Number(container.querySelector('#goal-carb').value),
      salt: Number(container.querySelector('#goal-salt').value),
      expenditureKcal: Number(container.querySelector('#goal-expenditure').value),
    };
    await saveGoals(db, newGoals);
    Object.assign(goals, newGoals);
    savedMsg.classList.remove('hidden');
    setTimeout(() => savedMsg.classList.add('hidden'), 2000);
    onSaved?.();
  });

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

  const backupSection = document.createElement('div');
  backupSection.id = 'backup-section';
  container.appendChild(backupSection);
  import('https://taka070600538-tech.github.io/app-sync/v1/sync.js')
    .then((sync) => sync.renderSyncSettings(backupSection))
    .catch(() => {
      backupSection.innerHTML = '<p class="settings-note">バックアップ機能は現在利用できません(オフラインの可能性)。</p>';
    });
}
