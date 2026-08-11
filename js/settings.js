import { collectBackup, restoreBackup } from './backup.js';

export function renderSettingsView(container, db, goals, { onSaved } = {}) {
  container.innerHTML = `
    <h2>設定</h2>
    <div id="backup-section"></div>
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
    <div id="token-section"></div>
    <div class="import-export-section">
      <h3 class="settings-heading">インポート・エクスポート</h3>
      <div class="import-export-buttons">
        <button type="button" id="export-data">エクスポート(JSON保存)</button>
        <button type="button" id="import-data">インポート(JSON読込)</button>
      </div>
      <input type="file" id="import-file" accept=".json,application/json" class="hidden">
      <p class="settings-note">エクスポートは全データ(食品・食事記録・目標)をJSONファイルとして保存します。インポートは現在のデータをファイルの内容で置き換えます。</p>
    </div>
  `;

  const exportBtn = container.querySelector('#export-data');
  const importBtn = container.querySelector('#import-data');
  const importFile = container.querySelector('#import-file');

  exportBtn.addEventListener('click', async () => {
    try {
      const data = await collectBackup(db);
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const today = new Date().toISOString().slice(0, 10);
      const a = document.createElement('a');
      a.href = url;
      a.download = `calorie-app-backup-${today}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('エクスポートに失敗しました: ' + err.message);
    }
  });

  importBtn.addEventListener('click', () => {
    importFile.click();
  });

  importFile.addEventListener('change', async () => {
    const file = importFile.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const confirmed = confirm('現在のデータをすべてインポート内容で置き換えます。よろしいですか?');
      if (!confirmed) return;
      await restoreBackup(db, data);
      alert('インポートしました。ページを再読み込みします。');
      location.reload();
    } catch (err) {
      console.error(err);
      alert('インポートに失敗しました: ' + err.message);
    } finally {
      importFile.value = '';
    }
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

  const backupSection = container.querySelector('#backup-section');
  const tokenSection = container.querySelector('#token-section');
  import('https://taka070600538-tech.github.io/app-sync/v1/sync.js')
    .then((sync) => {
      sync.renderBackupControls(backupSection);
      sync.renderTokenSettings(tokenSection);
    })
    .catch(() => {
      backupSection.innerHTML = '<p class="settings-note">バックアップ機能は現在利用できません(オフラインの可能性)。</p>';
    });
}
