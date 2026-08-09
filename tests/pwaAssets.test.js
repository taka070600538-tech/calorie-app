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
