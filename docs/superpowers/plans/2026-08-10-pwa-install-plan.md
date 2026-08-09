# スマホインストール対応(GitHub Pages公開) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **注意:** この計画はTask 3・4でユーザーのGitHub手動操作とController自身のブラウザ操作を必要とするため、**inline実行(executing-plans)を推奨**する。

**Goal:** カロリー計算アプリをGitHub Pagesで公開し、AndroidのChromeからホーム画面に追加(インストール)できるようにする。

**Architecture:** コード変更はPNGアイコン3種の追加とmanifest.json/sw.jsの更新のみ。公開はGitHub Pages(branch配信、Actions不使用)。リポジトリ作成とPages有効化はユーザーがGitHub上で手動実施し、pushはGit Credential Manager(ブラウザ認証)に任せる。

**Tech Stack:** 静的PWA(HTML/CSS/JS、外部ライブラリなし)、node:test、ブラウザcanvas(SVG→PNGラスタライズ)、GitHub Pages

## Global Constraints

- 外部ライブラリ・ビルドツールは一切追加しない(specの現行方針)
- 食事記録データは端末のIndexedDBにのみ保存、外部送信なし(現行設計を変えない)
- パスはすべて相対(`./`)のまま(GitHub Pagesのサブパス配下で動かすため)
- JSアセットを追加・変更したら `sw.js` の `ASSETS` と `CACHE_NAME` を更新する(今回は `calorie-app-v7`)
- テストは `node --test tests/*.test.js`(ESM、`node:test` + `assert/strict`)
- コミットメッセージは既存の慣習(`feat:`/`test:`/`docs:` + 日本語)に従う

---

### Task 1: PNGアイコン3種の生成

**Files:**
- Create: `icons/icon-192.png`(192×192、透過背景に角丸タイル)
- Create: `icons/icon-512.png`(512×512、同上)
- Create: `icons/icon-maskable-512.png`(512×512、全面`#2f6f4f`塗り+図柄を中央80%に縮小)

**Interfaces:**
- Consumes: `icons/icon.svg`(既存。viewBox="0 0 100 100"、幅・高さ属性なし)
- Produces: 上記PNG 3ファイル。Task 2のmanifest/テストがこのファイル名を参照する。

- [ ] **Step 1: ローカルサーバーを確認・起動する**

ポート8950で既にサーバーが動いているか確認し、無ければ起動する(バックグラウンド)。

```bash
python -m http.server 8950
```

- [ ] **Step 2: ブラウザでPNGをラスタライズする**

Browserパネルで `http://localhost:8950/` を開き、`javascript_tool` で以下を実行して
base64のPNGを3つ得る。**SVGにはwidth/height属性が無いため、必ず注入してから読み込む**
(無いとChromeが既定の内在サイズで低解像度ラスタライズする)。

```js
const svgText = (await (await fetch('./icons/icon.svg')).text())
  .replace('<svg ', '<svg width="512" height="512" ');
const img = new Image();
const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
function draw(size, maskable) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (maskable) {
    // Androidの丸型マスクで欠けないよう、全面を背景色で塗り図柄を中央80%(安全域)に収める。
    // SVG自体の角丸タイルも#2f6f4fなので継ぎ目は見えない。
    ctx.fillStyle = '#2f6f4f';
    ctx.fillRect(0, 0, size, size);
    const s = size * 0.8, o = size * 0.1;
    ctx.drawImage(img, o, o, s, s);
  } else {
    ctx.drawImage(img, 0, 0, size, size);
  }
  return c.toDataURL('image/png').split(',')[1];
}
return JSON.stringify({ i192: draw(192, false), i512: draw(512, false), m512: draw(512, true) });
```

- [ ] **Step 3: base64をデコードしてicons/に保存する**

得られたbase64をscratchpadのJSONファイル(例: `icons.json`、キーは `i192`/`i512`/`m512`)に
保存し、以下でデコードする。

```bash
node -e "
const fs = require('fs');
const j = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
const map = { i192: 'icons/icon-192.png', i512: 'icons/icon-512.png', m512: 'icons/icon-maskable-512.png' };
for (const [k, f] of Object.entries(map)) fs.writeFileSync(f, Buffer.from(j[k], 'base64'));
console.log('saved');
" "<scratchpadのicons.jsonのパス>"
```

- [ ] **Step 4: PNGの実寸を検証する**

```bash
node -e "
const fs = require('fs');
for (const [f, w] of [['icons/icon-192.png', 192], ['icons/icon-512.png', 512], ['icons/icon-maskable-512.png', 512]]) {
  const b = fs.readFileSync(f);
  const width = b.readUInt32BE(16), height = b.readUInt32BE(20);
  if (width !== w || height !== w) throw new Error(f + ': ' + width + 'x' + height);
  console.log(f, width + 'x' + height, 'OK');
}
"
```

Expected: 3ファイルとも OK

- [ ] **Step 5: 見た目を確認してコミット**

生成したPNG(特にmaskable版の余白)をReadツールで画像として開いて目視確認し、問題なければコミット。

```bash
git add icons/icon-192.png icons/icon-512.png icons/icon-maskable-512.png
git commit -m "feat: ホーム画面追加用のPNGアイコン(192/512/maskable)を追加する"
```

---

### Task 2: manifest.json / sw.js の更新(整合性テスト付き)

**Files:**
- Create: `tests/pwaAssets.test.js`
- Modify: `manifest.json`(iconsにPNG 3つを追記)
- Modify: `sw.js`(ASSETSにアイコン追加、CACHE_NAMEをv7に)

**Interfaces:**
- Consumes: Task 1のPNG 3ファイル
- Produces: manifestとsw.jsの整合性を将来にわたり保証するテスト

- [ ] **Step 1: 失敗するテストを書く**

`tests/pwaAssets.test.js` を新規作成:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const swSource = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

// sw.jsのASSETS配列を文字列として抜き出す(sw.jsはself前提でimportできないため)
function swAssets() {
  const m = swSource.match(/const ASSETS = \[([\s\S]*?)\];/);
  assert.ok(m, 'sw.jsにASSETS配列がある');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1].replace(/^\.\//, ''));
}

function pngSize(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

test('manifest: PNGアイコン3種(192/512/maskable)が宣言されている', () => {
  const srcs = manifest.icons.map((i) => i.src);
  assert.ok(srcs.includes('icons/icon-192.png'));
  assert.ok(srcs.includes('icons/icon-512.png'));
  assert.ok(srcs.includes('icons/icon-maskable-512.png'));
  const maskable = manifest.icons.find((i) => i.src === 'icons/icon-maskable-512.png');
  assert.equal(maskable.purpose, 'maskable');
});

test('manifest: 宣言された全アイコンファイルが実在する', () => {
  for (const icon of manifest.icons) {
    assert.ok(fs.existsSync(path.join(root, icon.src)), icon.src + ' が存在する');
  }
});

test('manifest: PNGアイコンの実寸がsizes宣言と一致する', () => {
  for (const icon of manifest.icons.filter((i) => i.type === 'image/png')) {
    const [w, h] = icon.sizes.split('x').map(Number);
    const actual = pngSize(fs.readFileSync(path.join(root, icon.src)));
    assert.deepEqual(actual, { width: w, height: h }, icon.src);
  }
});

test('sw.js: manifestの全アイコンがASSETSに含まれる', () => {
  const assets = swAssets();
  for (const icon of manifest.icons) {
    assert.ok(assets.includes(icon.src), icon.src + ' がASSETSにある');
  }
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `node --test tests/pwaAssets.test.js`
Expected: FAIL(manifestにPNGが未宣言のため1つ目のテストが落ちる。SVGがASSETSに無いため4つ目も落ちる)

- [ ] **Step 3: manifest.jsonとsw.jsを更新する**

`manifest.json` のiconsを以下に置き換える:

```json
"icons": [
  { "src": "icons/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" },
  { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
  { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
  { "src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
]
```

`sw.js` の先頭を更新する:

```js
const CACHE_NAME = 'calorie-app-v7';
```

`ASSETS` 配列の末尾(`'./js/analyticsView.js',` の後)に追加:

```js
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
```

- [ ] **Step 4: 全テストが通ることを確認する**

Run: `node --test tests/*.test.js`
Expected: 全件PASS(既存68件 + 新規4件 = 72件)

- [ ] **Step 5: コミット**

```bash
git add tests/pwaAssets.test.js manifest.json sw.js
git commit -m "feat: manifestとService WorkerにPNGアイコンを登録しキャッシュをv7に上げる"
```

---

### Task 3: GitHubリポジトリの作成とpush

**Files:** なし(git操作のみ)

**Interfaces:**
- Consumes: masterブランチの全コミット
- Produces: GitHub上の公開リポジトリ `calorie-app`(Task 4のPages配信元)

- [ ] **Step 1: ユーザーに空リポジトリの作成を依頼する**

`gh` CLIが無いため、ユーザーに以下を依頼して完了を待つ:

> https://github.com/new で、リポジトリ名 `calorie-app`、**Public**、
> README・.gitignore・ライセンスは**すべて追加しない**(空のまま)で作成してください。
> 作成できたらリポジトリのURL(またはGitHubユーザー名)を教えてください。

- [ ] **Step 2: リモートを登録してpushする**

ユーザーから聞いたURLで(`<ユーザー名>`はユーザーの回答で置き換える):

```bash
git remote add origin https://github.com/<ユーザー名>/calorie-app.git
git push -u origin master
```

認証はGit Credential Managerがブラウザで肩代わりする。
**注意:** 未追跡の `.claude/`(worktree管理用)は追跡しないこと(`git add`しない)。

- [ ] **Step 3: pushの成功を確認する**

Run: `git status` および `git log origin/master -1 --oneline`
Expected: `Your branch is up to date with 'origin/master'`、最新コミットが一致

---

### Task 4: Pages有効化・公開確認・README更新

**Files:**
- Modify: `README.md`(「スマホにインストールする」セクションを追加)

**Interfaces:**
- Consumes: Task 3で作成されたGitHubリポジトリ
- Produces: 公開URL `https://<ユーザー名>.github.io/calorie-app/` で動くPWA

- [ ] **Step 1: ユーザーにPages有効化を依頼する**

> リポジトリの **Settings → Pages → Build and deployment** で
> Source: **Deploy from a branch**、Branch: **master** / **(root)** を選んで
> Save してください。完了したら教えてください。

- [ ] **Step 2: 公開URLの配信を確認する**

デプロイに1〜2分かかるため、Browserパネルで `https://<ユーザー名>.github.io/calorie-app/` を開き
(404なら少し待って再読み込み)、`javascript_tool` で以下を確認する:

```js
const checks = {};
for (const p of ['manifest.json', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png']) {
  checks[p] = (await fetch('./' + p, { cache: 'no-store' })).status;
}
checks.swRegistered = (await navigator.serviceWorker.getRegistrations()).length > 0;
checks.appRendered = !!document.querySelector('nav');
return JSON.stringify(checks);
```

Expected: 全パスが200、`swRegistered: true`、`appRendered: true`

- [ ] **Step 3: READMEに公開・インストール手順を追記する**

「起動方法」セクションの後に追加(`<ユーザー名>`は実際の値で):

```markdown
## スマホにインストールする

GitHub Pagesで公開している。

- 公開URL: https://<ユーザー名>.github.io/calorie-app/

AndroidのChromeで公開URLを開き、メニュー(⋮)→「ホーム画面に追加」→「インストール」で
アプリとしてインストールできる。データは端末のIndexedDBにのみ保存され、外部には送信されない。

### 変更を公開に反映する

`master` にコミットして `git push` すると、1〜2分でGitHub Pagesに反映される。
JS・CSS・データファイルを変更したときは `sw.js` の `CACHE_NAME` を上げること
(cache-firstのため、上げないとインストール済みアプリが古いキャッシュを使い続ける)。
インストール済みアプリは、開き直すと新しいService Workerを取得して更新される。
```

- [ ] **Step 4: コミットしてpushする**

```bash
git add README.md
git commit -m "docs: GitHub Pagesの公開URLとスマホへのインストール手順をREADMEに追記する"
git push
```

- [ ] **Step 5: ユーザーにスマホでのインストールを案内する**

公開URLを提示し、AndroidのChromeで開いて「ホーム画面に追加」する手順を案内する。
インストール後、機内モードでも起動できること(オフライン動作)の確認を勧める。
