# 分析タブ 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 記録の経時的な推移を期間指定つきの表と折れ線グラフで振り返り、期間平均・カロリー収支・体脂肪換算を確認できる「分析」タブを追加する。

**Architecture:** 計算（`analytics.js`）・SVG 生成（`lineChart.js`）・日付演算（`dateUtils.js`）を純粋関数のモジュールに分け、DOM を触るのは `analyticsView.js` だけに閉じる。既存の `nutrition.js` / `mextTable.js` と同じ「純粋関数を切り出して `node --test` を当てる」流儀に揃える。データは `by_date` インデックス＋`IDBKeyRange.bound` で期間ごと1クエリ取得し、日別集約はメモリ上で行う。

**Tech Stack:** 素の HTML / CSS / ES モジュール、IndexedDB、`node --test`。ビルドツール・フレームワーク・外部ライブラリは一切なし。

設計書: `docs/superpowers/specs/2026-08-09-analytics-view-design.md`

## Global Constraints

- **外部ライブラリ・CDN・ビルドツールは禁止。** グラフは Chart.js 等ではなく手書きのインライン SVG で描く
- **外部通信は一切しない。** データは IndexedDB 内で完結する
- ES モジュール（`package.json` は `"type": "module"`）。すべて `import` / `export` で書く
- テストは `node --test tests/*.test.js`。現状 32 件が PASS しており、これを壊さない
- DOM を触るモジュール（`*View.js` / `render.js` / `*Form.js`）は自動テストの対象外。純粋関数だけをテストする
- UI の文言はすべて日本語
- `js/render.js` の `escapeHtml` を、ユーザー由来の文字列を HTML に埋める箇所で必ず使う
- 既存の CSS 変数（`--color-primary` / `--color-text-muted` / `--spacing-md` など `style.css` 冒頭の `:root`）を使い、色や余白をハードコードしない
- **IndexedDB の `DB_VERSION` は 2 のまま変更しない。** `goals` ストアはスキーマレスなのでフィールド追加にマイグレーションは不要
- カロリー収支は **摂取 − 消費**。プラスが余剰（体脂肪が増える向き）
- 体脂肪換算は **収支 kcal ÷ 7200 = kg**
- 無記録日は平均の分母にも収支の日数にも含めない

---

### Task 1: 日付ユーティリティの切り出し

**Files:**
- Create: `js/dateUtils.js`
- Create: `tests/dateUtils.test.js`
- Modify: `js/app.js:1-29`（`formatDate` / `shiftDate` のローカル定義を削除して import に置き換え）

**Interfaces:**
- Consumes: なし
- Produces:
  - `formatDate(dateObj: Date) -> string`（`'YYYY-MM-DD'`）
  - `shiftDate(dateStr: string, days: number) -> string`
  - `diffDays(fromStr: string, toStr: string) -> number`（日数の差。`from` が `to` より後なら負）
  - `calcPresetRange(todayStr: string, days: number) -> { from: string, to: string }`

`formatDate` と `shiftDate` は現在 `js/app.js` にローカル定義されている。分析画面からも必要になるため、ここへ移して共有する。振る舞いは変えない。

- [ ] **Step 1: 失敗するテストを書く**

`tests/dateUtils.test.js` を新規作成する。

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, shiftDate, diffDays, calcPresetRange } from '../js/dateUtils.js';

test('formatDate: 1桁の月日はゼロ埋めされる', () => {
  assert.equal(formatDate(new Date(2026, 0, 5)), '2026-01-05');
});

test('formatDate: 2桁の月日はそのまま', () => {
  assert.equal(formatDate(new Date(2026, 10, 23)), '2026-11-23');
});

test('shiftDate: 前日へ戻ると月をまたぐ', () => {
  assert.equal(shiftDate('2026-08-01', -1), '2026-07-31');
});

test('shiftDate: 翌日へ進むと年をまたぐ', () => {
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
});

test('shiftDate: うるう年の2月29日が存在する', () => {
  assert.equal(shiftDate('2024-02-28', 1), '2024-02-29');
});

test('shiftDate: 平年は2月28日の翌日が3月1日', () => {
  assert.equal(shiftDate('2026-02-28', 1), '2026-03-01');
});

test('shiftDate: 0日ずらすと同じ日付', () => {
  assert.equal(shiftDate('2026-08-09', 0), '2026-08-09');
});

test('diffDays: 同じ日は0', () => {
  assert.equal(diffDays('2026-08-09', '2026-08-09'), 0);
});

test('diffDays: 月をまたいでも実日数を返す', () => {
  assert.equal(diffDays('2026-07-31', '2026-08-01'), 1);
  assert.equal(diffDays('2026-08-01', '2026-08-09'), 8);
});

test('diffDays: うるう年の2月を含む差を正しく数える', () => {
  assert.equal(diffDays('2024-02-28', '2024-03-01'), 2);
  assert.equal(diffDays('2026-02-28', '2026-03-01'), 1);
});

test('diffDays: 逆順なら負の値を返す', () => {
  assert.equal(diffDays('2026-08-09', '2026-08-01'), -8);
});

test('calcPresetRange: 直近7日は今日を含めて7日間', () => {
  assert.deepEqual(calcPresetRange('2026-08-09', 7), { from: '2026-08-03', to: '2026-08-09' });
});

test('calcPresetRange: 直近1日は開始日と終了日が同じ', () => {
  assert.deepEqual(calcPresetRange('2026-08-09', 1), { from: '2026-08-09', to: '2026-08-09' });
});

test('calcPresetRange: 直近30日は月をまたぐ', () => {
  assert.deepEqual(calcPresetRange('2026-08-09', 30), { from: '2026-07-11', to: '2026-08-09' });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

```bash
node --test tests/dateUtils.test.js
```

Expected: FAIL。`Cannot find module ... js/dateUtils.js` となる。

- [ ] **Step 3: 最小限の実装を書く**

`js/dateUtils.js` を新規作成する。

```javascript
export function formatDate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function shiftDate(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

// 日数の差を数えるだけなのでUTCで解釈する。ローカル時刻だと将来サマータイムのある
// 地域で1日ぶんずれる可能性がある。
export function diffDays(fromStr, toStr) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const from = new Date(`${fromStr}T00:00:00Z`);
  const to = new Date(`${toStr}T00:00:00Z`);
  return Math.round((to - from) / MS_PER_DAY);
}

// 「直近N日」は今日を含めてN日間を意味する。
export function calcPresetRange(todayStr, days) {
  return { from: shiftDate(todayStr, -(days - 1)), to: todayStr };
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

```bash
node --test tests/dateUtils.test.js
```

Expected: PASS（14 件）。

- [ ] **Step 5: `js/app.js` の重複定義を削除する**

`js/app.js` の 1 行目の import 群の直後に import を追加する。

```javascript
import { formatDate, shiftDate } from './dateUtils.js';
```

そのうえで `js/app.js:18-29` にある以下の2つの関数定義を**丸ごと削除**する。

```javascript
function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftDate(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}
```

呼び出し側（`state.date` の初期化、`bindDateNav`、`copyPreviousDay`）は変更不要。

- [ ] **Step 6: 全テストを実行して既存が壊れていないことを確認する**

```bash
node --test tests/*.test.js
```

Expected: PASS 46 件（既存 32 件 ＋ 新規 14 件）、FAIL 0 件。

- [ ] **Step 7: コミット**

```bash
git add js/dateUtils.js tests/dateUtils.test.js js/app.js
git commit -m "refactor: 日付ユーティリティをdateUtils.jsへ切り出してdiffDaysとcalcPresetRangeを追加する"
```

---

### Task 2: 期間集計の計算（`js/analytics.js`）

**Files:**
- Create: `js/analytics.js`
- Create: `tests/analytics.test.js`

**Interfaces:**
- Consumes: `sumNutrients` from `js/nutrition.js`
- Produces:
  - `groupMealsByDate(meals) -> [{ date, kcal, protein, fat, carb, salt }]`（日付昇順、記録のある日だけ）
  - `calcPeriodStats(dailyTotals, expenditureKcal) -> { dayCount, averages: { kcal, protein, fat, carb, salt }, totalIntakeKcal, totalExpenditureKcal, energyBalanceKcal, bodyFatKg }`

`meals` レコードは記録時点の栄養値を実体として持つ（`kcal` / `protein` / `fat` / `carb` / `salt`）ため、食品マスタを参照する必要はない。

- [ ] **Step 1: 失敗するテストを書く**

`tests/analytics.test.js` を新規作成する。

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { groupMealsByDate, calcPeriodStats } from '../js/analytics.js';

function meal(date, kcal, protein, fat, carb, salt) {
  return { date, kcal, protein, fat, carb, salt };
}

test('groupMealsByDate: 同じ日の複数記録が1行に合算される', () => {
  const meals = [
    meal('2026-08-01', 500, 20, 15, 60, 1.5),
    meal('2026-08-01', 300, 10, 5, 40, 0.5),
  ];
  assert.deepEqual(groupMealsByDate(meals), [
    { date: '2026-08-01', kcal: 800, protein: 30, fat: 20, carb: 100, salt: 2 },
  ]);
});

test('groupMealsByDate: 入力順にかかわらず日付昇順で返す', () => {
  const meals = [
    meal('2026-08-03', 300, 1, 1, 1, 0.1),
    meal('2026-08-01', 100, 1, 1, 1, 0.1),
    meal('2026-08-02', 200, 1, 1, 1, 0.1),
  ];
  assert.deepEqual(groupMealsByDate(meals).map((d) => d.date), [
    '2026-08-01', '2026-08-02', '2026-08-03',
  ]);
});

test('groupMealsByDate: 記録の無い日は要素にならない', () => {
  const meals = [
    meal('2026-08-01', 100, 1, 1, 1, 0.1),
    meal('2026-08-05', 200, 1, 1, 1, 0.1),
  ];
  const result = groupMealsByDate(meals);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((d) => d.date), ['2026-08-01', '2026-08-05']);
});

test('groupMealsByDate: 空配列は空配列を返す', () => {
  assert.deepEqual(groupMealsByDate([]), []);
});

test('calcPeriodStats: 平均・摂取合計・消費合計を計算する', () => {
  const dailyTotals = [
    { date: '2026-08-01', kcal: 2500, protein: 90, fat: 70, carb: 300, salt: 8 },
    { date: '2026-08-02', kcal: 2300, protein: 80, fat: 60, carb: 280, salt: 7 },
  ];
  const stats = calcPeriodStats(dailyTotals, 2000);
  assert.equal(stats.dayCount, 2);
  assert.deepEqual(stats.averages, { kcal: 2400, protein: 85, fat: 65, carb: 290, salt: 7.5 });
  assert.equal(stats.totalIntakeKcal, 4800);
  assert.equal(stats.totalExpenditureKcal, 4000);
});

test('calcPeriodStats: 摂取が消費を上回るとプラスの収支と体脂肪換算になる', () => {
  const dailyTotals = [
    { date: '2026-08-01', kcal: 2500, protein: 0, fat: 0, carb: 0, salt: 0 },
    { date: '2026-08-02', kcal: 2300, protein: 0, fat: 0, carb: 0, salt: 0 },
  ];
  const stats = calcPeriodStats(dailyTotals, 2000);
  assert.equal(stats.energyBalanceKcal, 800);
  assert.equal(stats.bodyFatKg, 0.11);
});

test('calcPeriodStats: 摂取が消費を下回るとマイナスの収支と体脂肪換算になる', () => {
  const dailyTotals = [
    { date: '2026-08-01', kcal: 1500, protein: 0, fat: 0, carb: 0, salt: 0 },
  ];
  const stats = calcPeriodStats(dailyTotals, 2000);
  assert.equal(stats.energyBalanceKcal, -500);
  assert.equal(stats.bodyFatKg, -0.07);
});

test('calcPeriodStats: 記録が0日でも0除算せずすべて0を返す', () => {
  const stats = calcPeriodStats([], 2000);
  assert.equal(stats.dayCount, 0);
  assert.deepEqual(stats.averages, { kcal: 0, protein: 0, fat: 0, carb: 0, salt: 0 });
  assert.equal(stats.totalIntakeKcal, 0);
  assert.equal(stats.totalExpenditureKcal, 0);
  assert.equal(stats.energyBalanceKcal, 0);
  assert.equal(stats.bodyFatKg, 0);
});

test('calcPeriodStats: 消費カロリーが0なら収支は摂取合計と等しい', () => {
  const dailyTotals = [
    { date: '2026-08-01', kcal: 1800, protein: 0, fat: 0, carb: 0, salt: 0 },
  ];
  const stats = calcPeriodStats(dailyTotals, 0);
  assert.equal(stats.totalExpenditureKcal, 0);
  assert.equal(stats.energyBalanceKcal, 1800);
});

test('calcPeriodStats: 平均は栄養素ごとに小数1桁へ丸める', () => {
  const dailyTotals = [
    { date: '2026-08-01', kcal: 2000, protein: 70, fat: 55, carb: 250, salt: 7 },
    { date: '2026-08-02', kcal: 2001, protein: 71, fat: 56, carb: 251, salt: 8 },
    { date: '2026-08-03', kcal: 2002, protein: 72, fat: 57, carb: 252, salt: 9 },
  ];
  const stats = calcPeriodStats(dailyTotals, 2000);
  assert.equal(stats.averages.kcal, 2001);
  assert.equal(stats.averages.protein, 71);
  assert.equal(stats.averages.salt, 8);
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

```bash
node --test tests/analytics.test.js
```

Expected: FAIL。`Cannot find module ... js/analytics.js` となる。

- [ ] **Step 3: 最小限の実装を書く**

`js/analytics.js` を新規作成する。

```javascript
import { sumNutrients } from './nutrition.js';

// 体脂肪組織はおよそ80%がトリグリセリドなので 9kcal/g × 0.8 ≈ 7.2kcal/g、
// すなわち1kgあたり約7200kcalとして換算する。
const KCAL_PER_KG_BODY_FAT = 7200;

const ZERO_NUTRIENTS = { kcal: 0, protein: 0, fat: 0, carb: 0, salt: 0 };

export function groupMealsByDate(meals) {
  const byDate = new Map();
  for (const meal of meals) {
    if (!byDate.has(meal.date)) byDate.set(meal.date, []);
    byDate.get(meal.date).push(meal);
  }
  // 'YYYY-MM-DD' は辞書順が時系列順と一致する。
  return [...byDate.keys()]
    .sort()
    .map((date) => ({ date, ...sumNutrients(byDate.get(date)) }));
}

export function calcPeriodStats(dailyTotals, expenditureKcal) {
  const dayCount = dailyTotals.length;
  if (dayCount === 0) {
    return {
      dayCount: 0,
      averages: { ...ZERO_NUTRIENTS },
      totalIntakeKcal: 0,
      totalExpenditureKcal: 0,
      energyBalanceKcal: 0,
      bodyFatKg: 0,
    };
  }

  const totals = sumNutrients(dailyTotals);
  const totalIntakeKcal = totals.kcal;
  const totalExpenditureKcal = expenditureKcal * dayCount;
  const energyBalanceKcal = Math.round(totalIntakeKcal - totalExpenditureKcal);

  return {
    dayCount,
    averages: {
      kcal: Math.round(totals.kcal / dayCount),
      protein: Math.round((totals.protein / dayCount) * 10) / 10,
      fat: Math.round((totals.fat / dayCount) * 10) / 10,
      carb: Math.round((totals.carb / dayCount) * 10) / 10,
      salt: Math.round((totals.salt / dayCount) * 10) / 10,
    },
    totalIntakeKcal,
    totalExpenditureKcal,
    energyBalanceKcal,
    bodyFatKg: Math.round((energyBalanceKcal / KCAL_PER_KG_BODY_FAT) * 100) / 100,
  };
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

```bash
node --test tests/analytics.test.js
```

Expected: PASS（10 件）。

- [ ] **Step 5: 全テストを実行する**

```bash
node --test tests/*.test.js
```

Expected: PASS 56 件、FAIL 0 件。

- [ ] **Step 6: コミット**

```bash
git add js/analytics.js tests/analytics.test.js
git commit -m "feat: 期間の日別集約・平均・カロリー収支・体脂肪換算をTDDで実装する"
```

---

### Task 3: 折れ線グラフの SVG 生成（`js/lineChart.js`）

**Files:**
- Create: `js/lineChart.js`
- Create: `tests/lineChart.test.js`

**Interfaces:**
- Consumes: `diffDays` from `js/dateUtils.js`（Task 1）
- Produces:
  - `niceCeil(value: number) -> number`
  - `buildLineChartSvg(points, { goalValue, unit, fromDate, toDate }) -> string`
    - `points`: `[{ date: 'YYYY-MM-DD', value: number }]` 日付昇順・記録のある日だけ

DOM も IndexedDB も触らない。SVG 文字列を返すだけ。

座標系は `viewBox="0 0 320 180"` に固定し、余白は上 16 / 右 12 / 下 24 / 左 40。したがって描画領域は x が 40〜308（幅 268）、y が 16〜156（高さ 140）。

x は「`fromDate` からの経過日数 ÷ 期間全体の日数」で決める。点を等間隔に並べると無記録日が詰まって時間軸が歪むため。y は 0 を下端に固定し、上端は `niceCeil(max(データ最大値, 目標値))`。

- [ ] **Step 1: 失敗するテストを書く**

`tests/lineChart.test.js` を新規作成する。

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { niceCeil, buildLineChartSvg } from '../js/lineChart.js';

// <polyline points="x,y x,y ..."> から座標の配列を取り出す
function extractPolylinePoints(svg) {
  const match = svg.match(/<polyline[^>]*points="([^"]+)"/);
  if (!match) return null;
  return match[1].split(' ').map((pair) => {
    const [x, y] = pair.split(',').map(Number);
    return { x, y };
  });
}

// <circle cx="..." cy="..."> をすべて取り出す
function extractDots(svg) {
  return [...svg.matchAll(/<circle[^>]*cx="([\d.-]+)"[^>]*cy="([\d.-]+)"/g)].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
  }));
}

function extractGoalLineY(svg) {
  const match = svg.match(/<line[^>]*class="chart-goal-line"[^>]*y1="([\d.-]+)"/);
  return match ? Number(match[1]) : null;
}

test('niceCeil: 2100は刻み500で2500に切り上がる', () => {
  assert.equal(niceCeil(2100), 2500);
});

test('niceCeil: 65は刻み5でちょうど65のまま', () => {
  assert.equal(niceCeil(65), 65);
});

test('niceCeil: 7.3は刻み0.5で7.5に切り上がる', () => {
  assert.equal(niceCeil(7.3), 7.5);
});

test('niceCeil: 0や負の値は1を返す(y軸が潰れるのを防ぐ)', () => {
  assert.equal(niceCeil(0), 1);
  assert.equal(niceCeil(-5), 1);
});

test('buildLineChartSvg: 期間の初日と最終日の点が描画領域の左右端に来る', () => {
  const svg = buildLineChartSvg(
    [
      { date: '2026-08-01', value: 2000 },
      { date: '2026-08-05', value: 1800 },
    ],
    { goalValue: 2000, unit: 'kcal', fromDate: '2026-08-01', toDate: '2026-08-05' }
  );
  const points = extractPolylinePoints(svg);
  assert.equal(points[0].x, 40);
  assert.equal(points[points.length - 1].x, 308);
});

test('buildLineChartSvg: 値が目標値と等しい点は目標線と同じy座標になる', () => {
  const svg = buildLineChartSvg(
    [
      { date: '2026-08-01', value: 2000 },
      { date: '2026-08-02', value: 1500 },
    ],
    { goalValue: 2000, unit: 'kcal', fromDate: '2026-08-01', toDate: '2026-08-02' }
  );
  const points = extractPolylinePoints(svg);
  assert.equal(points[0].y, extractGoalLineY(svg));
});

test('buildLineChartSvg: 無記録日を挟んだ2点のx間隔は連続する2点の2倍になる', () => {
  const svg = buildLineChartSvg(
    [
      { date: '2026-08-01', value: 100 },
      { date: '2026-08-02', value: 100 },
      { date: '2026-08-04', value: 100 },
    ],
    { goalValue: 100, unit: 'g', fromDate: '2026-08-01', toDate: '2026-08-04' }
  );
  const points = extractPolylinePoints(svg);
  const gap1 = points[1].x - points[0].x;
  const gap2 = points[2].x - points[1].x;
  // 座標は小数2桁へ丸めているため、厳密な2倍にはならない。丸め幅ぶんの許容差を持たせる。
  assert.ok(Math.abs(gap2 - gap1 * 2) < 0.05, `gap1=${gap1} gap2=${gap2}`);
});

test('buildLineChartSvg: 点が1つのときはpolylineを描かず点だけ描く', () => {
  const svg = buildLineChartSvg(
    [{ date: '2026-08-03', value: 1800 }],
    { goalValue: 2000, unit: 'kcal', fromDate: '2026-08-01', toDate: '2026-08-05' }
  );
  assert.equal(extractPolylinePoints(svg), null);
  assert.equal(extractDots(svg).length, 1);
});

test('buildLineChartSvg: 開始日と終了日が同じでも0除算せず点が中央に来る', () => {
  const svg = buildLineChartSvg(
    [{ date: '2026-08-03', value: 1800 }],
    { goalValue: 2000, unit: 'kcal', fromDate: '2026-08-03', toDate: '2026-08-03' }
  );
  const dots = extractDots(svg);
  assert.equal(dots.length, 1);
  assert.equal(dots[0].x, 174);
  assert.ok(Number.isFinite(dots[0].y));
});

test('buildLineChartSvg: 値が0でy軸上端も0になる場合でも点が描画領域内に収まる', () => {
  const svg = buildLineChartSvg(
    [
      { date: '2026-08-01', value: 0 },
      { date: '2026-08-02', value: 0 },
    ],
    { goalValue: 0, unit: 'g', fromDate: '2026-08-01', toDate: '2026-08-02' }
  );
  const points = extractPolylinePoints(svg);
  for (const p of points) {
    assert.ok(Number.isFinite(p.y), `y=${p.y}`);
    assert.ok(p.y >= 16 && p.y <= 156, `y=${p.y} が描画領域外`);
  }
});

test('buildLineChartSvg: viewBoxとwidth=100%を持ちレスポンシブになる', () => {
  const svg = buildLineChartSvg(
    [{ date: '2026-08-01', value: 100 }],
    { goalValue: 100, unit: 'g', fromDate: '2026-08-01', toDate: '2026-08-01' }
  );
  assert.ok(svg.includes('viewBox="0 0 320 180"'));
  assert.ok(svg.includes('width="100%"'));
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

```bash
node --test tests/lineChart.test.js
```

Expected: FAIL。`Cannot find module ... js/lineChart.js` となる。

- [ ] **Step 3: 最小限の実装を書く**

`js/lineChart.js` を新規作成する。

```javascript
import { diffDays } from './dateUtils.js';

const VIEW_WIDTH = 320;
const VIEW_HEIGHT = 180;
const PAD_TOP = 16;
const PAD_RIGHT = 12;
const PAD_BOTTOM = 24;
const PAD_LEFT = 40;

const PLOT_LEFT = PAD_LEFT;
const PLOT_RIGHT = VIEW_WIDTH - PAD_RIGHT;
const PLOT_TOP = PAD_TOP;
const PLOT_BOTTOM = VIEW_HEIGHT - PAD_BOTTOM;
const PLOT_WIDTH = PLOT_RIGHT - PLOT_LEFT;
const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP;

// y軸の上端を切りのいい値へ切り上げる。刻みは 10^floor(log10(v)) / 2。
// 2100 → 刻み500 → 2500、65 → 刻み5 → 65、7.3 → 刻み0.5 → 7.5。
// 値が0以下のときは1を返し、全点が下端に重なって潰れるのを防ぐ。
export function niceCeil(value) {
  if (!(value > 0)) return 1;
  const step = Math.pow(10, Math.floor(Math.log10(value))) / 2;
  // 7.3 / 0.5 のような割り算は誤差が出るので、切り上げ前に丸める。
  const ratio = Math.ceil(Number((value / step).toFixed(10)));
  return Number((ratio * step).toFixed(10));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function toMonthDay(dateStr) {
  const [, month, day] = dateStr.split('-');
  return `${Number(month)}/${Number(day)}`;
}

export function buildLineChartSvg(points, { goalValue, unit, fromDate, toDate }) {
  const values = points.map((p) => p.value);
  const maxValue = niceCeil(Math.max(goalValue || 0, ...values, 0));
  const spanDays = diffDays(fromDate, toDate);

  const xFor = (dateStr) => {
    // 期間が1日だけなら割り算できないので中央へ置く。
    if (spanDays <= 0) return PLOT_LEFT + PLOT_WIDTH / 2;
    return PLOT_LEFT + (diffDays(fromDate, dateStr) / spanDays) * PLOT_WIDTH;
  };
  const yFor = (value) => PLOT_TOP + PLOT_HEIGHT * (1 - value / maxValue);

  const coords = points.map((p) => ({ x: round2(xFor(p.date)), y: round2(yFor(p.value)) }));

  const polyline = coords.length >= 2
    ? `<polyline class="chart-line" points="${coords.map((c) => `${c.x},${c.y}`).join(' ')}" />`
    : '';
  const dots = coords
    .map((c) => `<circle class="chart-dot" cx="${c.x}" cy="${c.y}" r="3" />`)
    .join('');

  const goalY = round2(yFor(goalValue));
  const goalLine = goalValue > 0
    ? `<line class="chart-goal-line" x1="${PLOT_LEFT}" y1="${goalY}" x2="${PLOT_RIGHT}" y2="${goalY}" />`
      + `<text class="chart-label" x="${PLOT_RIGHT}" y="${goalY - 4}" text-anchor="end">目標 ${goalValue}${unit}</text>`
    : '';

  return `<svg class="line-chart" viewBox="0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}" width="100%" role="img" aria-label="${toMonthDay(fromDate)}から${toMonthDay(toDate)}までの推移">
  <line class="chart-axis" x1="${PLOT_LEFT}" y1="${PLOT_TOP}" x2="${PLOT_LEFT}" y2="${PLOT_BOTTOM}" />
  <line class="chart-axis" x1="${PLOT_LEFT}" y1="${PLOT_BOTTOM}" x2="${PLOT_RIGHT}" y2="${PLOT_BOTTOM}" />
  <text class="chart-label" x="${PLOT_LEFT - 6}" y="${PLOT_TOP + 4}" text-anchor="end">${maxValue}</text>
  <text class="chart-label" x="${PLOT_LEFT - 6}" y="${PLOT_BOTTOM}" text-anchor="end">0</text>
  <text class="chart-label" x="${PLOT_LEFT}" y="${VIEW_HEIGHT - 6}" text-anchor="start">${toMonthDay(fromDate)}</text>
  <text class="chart-label" x="${PLOT_RIGHT}" y="${VIEW_HEIGHT - 6}" text-anchor="end">${toMonthDay(toDate)}</text>
  ${goalLine}
  ${polyline}
  ${dots}
</svg>`;
}
```

`unit` は呼び出し側が固定の定数表から渡すため、ユーザー入力は SVG に入らない。

- [ ] **Step 4: テストを実行して成功を確認する**

```bash
node --test tests/lineChart.test.js
```

Expected: PASS（11 件）。

- [ ] **Step 5: 全テストを実行する**

```bash
node --test tests/*.test.js
```

Expected: PASS 67 件、FAIL 0 件。

- [ ] **Step 6: コミット**

```bash
git add js/lineChart.js tests/lineChart.test.js
git commit -m "feat: 折れ線グラフのSVG生成を純粋関数としてTDDで実装する"
```

---

### Task 4: 期間クエリと消費カロリー設定

**Files:**
- Modify: `js/db.js:90-95`（`getMealsByDateRange` を追加）、`js/db.js:124`（`DEFAULT_GOALS`）、`js/db.js:126-130`（`getGoals`）
- Modify: `js/settings.js`（消費カロリーの入力欄を追加）

**Interfaces:**
- Consumes: なし
- Produces:
  - `getMealsByDateRange(db, from, to) -> Promise<meal[]>`
  - `getGoals(db)` の返り値に `expenditureKcal: number` が必ず含まれる（既定 2000）

`DB_VERSION` は 2 のまま変更しない。IndexedDB のオブジェクトストアはスキーマレスなので、`goals` の `default` レコードへのフィールド追加にマイグレーションは不要。

- [ ] **Step 1: `js/db.js` に期間クエリを追加する**

`js/db.js` の `getMealsByDate`（90-95 行）の直後に追加する。

```javascript
export async function getMealsByDateRange(db, from, to) {
  const tx = db.transaction('meals', 'readonly');
  const index = tx.objectStore('meals').index('by_date');
  // date は 'YYYY-MM-DD' で辞書順が時系列順と一致するため範囲クエリが成立する。
  return promisifyRequest(index.getAll(IDBKeyRange.bound(from, to)));
}
```

- [ ] **Step 2: `js/db.js` の既定値とフォールバックを更新する**

`DEFAULT_GOALS`（124 行）を書き換える。

```javascript
const DEFAULT_GOALS = { id: 'default', kcal: 2000, protein: 60, fat: 60, carb: 250, salt: 7.0, expenditureKcal: 2000 };
```

`getGoals`（126-130 行）を書き換える。既存レコードに `expenditureKcal` が無い場合も既定値で埋まるようにする。

```javascript
export async function getGoals(db) {
  const tx = db.transaction('goals', 'readonly');
  const result = await promisifyRequest(tx.objectStore('goals').get('default'));
  // 既存レコードに新しいフィールドが無い場合も既定値で埋める。
  return { ...DEFAULT_GOALS, ...(result || {}) };
}
```

- [ ] **Step 3: `js/settings.js` に消費カロリーの入力欄を追加する**

`js/settings.js` の `container.innerHTML` に渡すテンプレート（4-15 行）を、以下で丸ごと置き換える。

```javascript
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
  `;
```

続けて `newGoals`（22-28 行）に `expenditureKcal` を追加する。このオブジェクトはフィールドを明示列挙しているため、追加しないと保存時に値が消える。

```javascript
    const newGoals = {
      kcal: Number(container.querySelector('#goal-kcal').value),
      protein: Number(container.querySelector('#goal-protein').value),
      fat: Number(container.querySelector('#goal-fat').value),
      carb: Number(container.querySelector('#goal-carb').value),
      salt: Number(container.querySelector('#goal-salt').value),
      expenditureKcal: Number(container.querySelector('#goal-expenditure').value),
    };
```

- [ ] **Step 4: 設定画面のスタイルを追加する**

`style.css` の末尾に追記する。

```css
.settings-heading {
  margin: var(--spacing-md) 0 var(--spacing-xs) 0;
  font-size: 0.95rem;
  color: var(--color-primary-dark);
}

.settings-note {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
```

- [ ] **Step 5: 全テストを実行して既存が壊れていないことを確認する**

```bash
node --test tests/*.test.js
```

Expected: PASS 67 件、FAIL 0 件（このタスクはテストを追加しないが、既存を壊していないことを確認する）。

- [ ] **Step 6: ブラウザで手動確認する**

ローカルサーバーを新しいポートで起動する。Service Worker が cache-first のため、既存ポートだと古いキャッシュが返る。

```bash
python -m http.server 8931
```

`http://localhost:8931` を開き、以下を確認する。

1. 「設定」タブに「栄養目標」と「消費カロリー」の2つの小見出しが出ている
2. 「1日の消費カロリー(kcal)」の初期値が 2000 になっている
3. 値を 2200 に変えて「保存」を押すと「保存しました」が出る
4. ページを再読み込みして設定タブを開き直すと 2200 のままである
5. 栄養目標の5項目も従来どおり保存・復元できる

- [ ] **Step 7: コミット**

```bash
git add js/db.js js/settings.js style.css
git commit -m "feat: 期間指定の記録取得と消費カロリー設定を追加する"
```

---

### Task 5: 分析タブの追加と期間セレクタ・サマリー表示

**Files:**
- Create: `js/analyticsView.js`
- Modify: `index.html:13-17`（ナビ）、`index.html:34-36`（view の追加）
- Modify: `js/app.js`（import と `bindNav` の分岐）
- Modify: `style.css`（末尾に追記）

**Interfaces:**
- Consumes:
  - `getMealsByDateRange(db, from, to)` from `js/db.js`（Task 4）
  - `groupMealsByDate(meals)` / `calcPeriodStats(dailyTotals, expenditureKcal)` from `js/analytics.js`（Task 2）
  - `formatDate(dateObj)` / `calcPresetRange(todayStr, days)` from `js/dateUtils.js`（Task 1）
  - `calcProgress(currentValue, goalValue)` from `js/nutrition.js`
  - `escapeHtml(str)` from `js/render.js`
- Produces:
  - `renderAnalyticsView(container, db, goals) -> void`
  - `METRICS` 定数（Task 6 のグラフ・表が同じ定義を使う）

このタスクではグラフと表はまだ描かない。期間セレクタとサマリーまでを動く状態にする。

- [ ] **Step 1: `index.html` にナビと view を追加する**

`index.html:13-17` の `<nav>` を書き換える。

```html
  <nav class="app-nav">
    <button data-view="dashboard" class="nav-btn is-active">今日の記録</button>
    <button data-view="analytics" class="nav-btn">分析</button>
    <button data-view="foods" class="nav-btn">食品管理</button>
    <button data-view="settings" class="nav-btn">設定</button>
  </nav>
```

`index.html:34` の `<main id="view-foods">` の直前に追加する。

```html
<main id="view-analytics" class="view hidden"></main>
```

- [ ] **Step 2: `js/analyticsView.js` を作成する**

```javascript
import { getMealsByDateRange } from './db.js';
import { groupMealsByDate, calcPeriodStats } from './analytics.js';
import { formatDate, calcPresetRange } from './dateUtils.js';
import { calcProgress } from './nutrition.js';
import { escapeHtml } from './render.js';

export const METRICS = [
  { key: 'kcal', label: 'カロリー', unit: 'kcal' },
  { key: 'protein', label: 'タンパク質', unit: 'g' },
  { key: 'fat', label: '脂質', unit: 'g' },
  { key: 'carb', label: '糖質', unit: 'g' },
  { key: 'salt', label: '塩分', unit: 'g' },
];

const PRESETS = [
  { days: 7, label: '直近7日' },
  { days: 30, label: '直近30日' },
  { days: 90, label: '直近90日' },
];

function formatSignedInt(value) {
  if (value === 0) return '0';
  const sign = value > 0 ? '+' : '-';
  return `${sign}${Math.abs(value).toLocaleString('ja-JP')}`;
}

function formatSignedKg(value) {
  const fixed = value.toFixed(2);
  if (Number(fixed) === 0) return '0.00';
  return value > 0 ? `+${fixed}` : fixed;
}

function signClass(value) {
  if (value > 0) return 'is-surplus';
  if (value < 0) return 'is-deficit';
  return '';
}

function renderSummary(stats, goals, from, to) {
  const rows = METRICS.map((metric) => {
    const average = stats.averages[metric.key];
    const goal = goals[metric.key];
    return `
      <tr>
        <th>${metric.label}</th>
        <td>${average.toLocaleString('ja-JP')}${metric.unit}</td>
        <td class="analytics-progress">目標の${calcProgress(average, goal)}%</td>
      </tr>
    `;
  }).join('');

  return `
    <p class="analytics-range">${stats.dayCount}日分の記録（${escapeHtml(from)} 〜 ${escapeHtml(to)}）</p>
    <h3 class="analytics-heading">1日あたりの平均</h3>
    <table class="analytics-avg-table"><tbody>${rows}</tbody></table>
    <h3 class="analytics-heading">カロリー収支</h3>
    <dl class="analytics-balance">
      <div><dt>摂取合計</dt><dd>${stats.totalIntakeKcal.toLocaleString('ja-JP')} kcal</dd></div>
      <div><dt>消費合計</dt><dd>${stats.totalExpenditureKcal.toLocaleString('ja-JP')} kcal</dd></div>
      <div><dt>収支</dt><dd class="${signClass(stats.energyBalanceKcal)}">${formatSignedInt(stats.energyBalanceKcal)} kcal</dd></div>
      <div><dt>体脂肪換算</dt><dd class="${signClass(stats.bodyFatKg)}">${formatSignedKg(stats.bodyFatKg)} kg</dd></div>
    </dl>
    <p class="analytics-note">消費カロリー ${goals.expenditureKcal.toLocaleString('ja-JP')} kcal/日 として計算</p>
  `;
}

export function renderAnalyticsView(container, db, goals) {
  const today = formatDate(new Date());
  const initialRange = calcPresetRange(today, 7);
  const state = {
    from: initialRange.from,
    to: initialRange.to,
    metric: 'kcal',
    dailyTotals: [],
  };

  container.innerHTML = `
    <h2>分析</h2>
    <div class="analytics-period">
      <div class="analytics-presets">
        ${PRESETS.map((p) => `<button type="button" class="analytics-preset-btn" data-days="${p.days}">${p.label}</button>`).join('')}
      </div>
      <div class="analytics-dates">
        <label>開始 <input type="date" id="analytics-from" value="${state.from}"></label>
        <label>終了 <input type="date" id="analytics-to" value="${state.to}"></label>
      </div>
    </div>
    <div id="analytics-body"></div>
  `;

  const body = container.querySelector('#analytics-body');
  const fromInput = container.querySelector('#analytics-from');
  const toInput = container.querySelector('#analytics-to');

  function showMessage(message) {
    body.innerHTML = `<p class="analytics-message">${escapeHtml(message)}</p>`;
  }

  function renderBody() {
    const stats = calcPeriodStats(state.dailyTotals, goals.expenditureKcal);
    body.innerHTML = renderSummary(stats, goals, state.from, state.to);
  }

  async function load() {
    // 日付入力は空にできる。空のまま範囲クエリを投げると全期間が返ってしまうので先に弾く。
    if (!state.from || !state.to) {
      showMessage('開始日と終了日を指定してください。');
      return;
    }
    if (state.from > state.to) {
      showMessage('開始日が終了日より後です。');
      return;
    }
    try {
      const meals = await getMealsByDateRange(db, state.from, state.to);
      state.dailyTotals = groupMealsByDate(meals);
    } catch (err) {
      console.error(err);
      showMessage('記録の読み込みに失敗しました。');
      return;
    }
    if (state.dailyTotals.length === 0) {
      showMessage('この期間に記録がありません。');
      return;
    }
    renderBody();
  }

  container.querySelectorAll('.analytics-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const range = calcPresetRange(formatDate(new Date()), Number(btn.dataset.days));
      state.from = range.from;
      state.to = range.to;
      // プリセットを押したら日付入力も同期させ、何日から何日を見ているか常に読み取れるようにする。
      fromInput.value = state.from;
      toInput.value = state.to;
      load();
    });
  });

  fromInput.addEventListener('change', () => {
    state.from = fromInput.value;
    load();
  });
  toInput.addEventListener('change', () => {
    state.to = toInput.value;
    load();
  });

  load();
}
```

- [ ] **Step 3: `js/app.js` にナビの分岐を追加する**

import 群に追加する。

```javascript
import { renderAnalyticsView } from './analyticsView.js';
```

`bindNav`（74-90 行）の分岐に `analytics` を追加する。`state.goals` は設定画面が `Object.assign` で書き換えるため、常に最新の値が渡る。

```javascript
function bindNav() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (view === 'foods') {
        openFoodsView();
      } else if (view === 'analytics') {
        switchView('analytics');
        renderAnalyticsView(document.getElementById('view-analytics'), state.db, state.goals);
      } else if (view === 'settings') {
        switchView('settings');
        renderSettingsView(document.getElementById('view-settings'), state.db, state.goals, {
          onSaved: refreshDashboard,
        });
      } else {
        switchView(view);
      }
    });
  });
}
```

- [ ] **Step 4: スタイルを追加する**

`style.css` の末尾に追記する。

```css
.analytics-period {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

.analytics-presets {
  display: flex;
  gap: var(--spacing-sm);
}

.analytics-preset-btn {
  flex: 1;
  padding: var(--spacing-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.85rem;
}

.analytics-dates {
  display: flex;
  gap: var(--spacing-sm);
}

.analytics-dates label {
  flex: 1;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.analytics-dates input {
  width: 100%;
}

.analytics-range {
  margin: 0 0 var(--spacing-sm) 0;
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

.analytics-heading {
  margin: var(--spacing-md) 0 var(--spacing-xs) 0;
  font-size: 0.95rem;
  color: var(--color-primary-dark);
}

.analytics-avg-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.analytics-avg-table th {
  text-align: left;
  font-weight: normal;
  padding: var(--spacing-xs) 0;
}

.analytics-avg-table td {
  text-align: right;
  padding: var(--spacing-xs) 0;
}

.analytics-progress {
  color: var(--color-text-muted);
  font-size: 0.8rem;
}

.analytics-balance {
  margin: 0;
  font-size: 0.9rem;
}

.analytics-balance div {
  display: flex;
  justify-content: space-between;
  padding: var(--spacing-xs) 0;
}

.analytics-balance dt {
  color: var(--color-text-muted);
}

.analytics-balance dd {
  margin: 0;
  font-weight: bold;
}

.analytics-balance .is-surplus { color: var(--color-danger); }
.analytics-balance .is-deficit { color: var(--color-primary); }

.analytics-note {
  margin: var(--spacing-sm) 0 0 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.analytics-message {
  padding: var(--spacing-lg) 0;
  text-align: center;
  color: var(--color-text-muted);
}
```

- [ ] **Step 5: 全テストを実行する**

```bash
node --test tests/*.test.js
```

Expected: PASS 67 件、FAIL 0 件。

- [ ] **Step 6: ブラウザで手動確認する**

新しいポートで起動する。

```bash
python -m http.server 8932
```

`http://localhost:8932` を開き、以下を確認する。記録が数日分ない場合は、まず「今日の記録」で 2〜3 日分を登録してから確認する。

1. ナビに「分析」が4つ並び、押すと分析画面へ切り替わる
2. 初期表示が直近7日になっており、日付入力にも同じ範囲が入っている
3. 「◯日分の記録（YYYY-MM-DD 〜 YYYY-MM-DD）」が記録のある日数と一致している
4. 平均・摂取合計・消費合計・収支・体脂肪換算が表示される
5. 収支がプラスなら `+` 付き、マイナスなら `-` 付きで、色が変わる
6. 「消費カロリー ◯ kcal/日 として計算」が出ている
7. 「直近30日」を押すと日付入力も 30 日前に書き換わり、集計が変わる
8. 開始日を終了日より後にすると「開始日が終了日より後です。」が出る
9. 記録の無い期間を選ぶと「この期間に記録がありません。」が出る

- [ ] **Step 7: コミット**

```bash
git add index.html js/analyticsView.js js/app.js style.css
git commit -m "feat: 分析タブを追加し期間指定と栄養素の平均・カロリー収支を表示する"
```

---

### Task 6: グラフと日別テーブルの追加

**Files:**
- Modify: `js/analyticsView.js`（`renderBody` にグラフと表を追加、タブのイベントを追加）
- Modify: `style.css`（末尾に追記）

**Interfaces:**
- Consumes: `buildLineChartSvg(points, { goalValue, unit, fromDate, toDate })` from `js/lineChart.js`（Task 3）
- Produces: なし（画面の完成）

栄養素タブの切り替えでは IndexedDB を読み直さない。取得済みの `state.dailyTotals` からグラフだけ描き直す。

- [ ] **Step 1: import を追加する**

`js/analyticsView.js` の import 群に追加する。

```javascript
import { buildLineChartSvg } from './lineChart.js';
```

- [ ] **Step 2: グラフと表を組み立てる関数を追加する**

`js/analyticsView.js` の `renderSummary` 関数の直後に追加する。

```javascript
function renderChartSection(state, goals) {
  const metric = METRICS.find((m) => m.key === state.metric);
  const points = state.dailyTotals.map((day) => ({ date: day.date, value: day[metric.key] }));
  const svg = buildLineChartSvg(points, {
    goalValue: goals[metric.key],
    unit: metric.unit,
    fromDate: state.from,
    toDate: state.to,
  });
  return `<div class="analytics-chart">${svg}</div>`;
}

function renderTabs(currentMetric) {
  return `
    <div class="analytics-tabs">
      ${METRICS.map((m) => `
        <button type="button" class="analytics-tab-btn${m.key === currentMetric ? ' is-active' : ''}" data-metric="${m.key}">${m.label}</button>
      `).join('')}
    </div>
  `;
}

function renderTable(dailyTotals, expenditureKcal) {
  // groupMealsByDate は日付昇順で返すので、表示は新しい順へ反転する。
  const rows = [...dailyTotals].reverse().map((day) => {
    const balance = day.kcal - expenditureKcal;
    return `
      <tr>
        <td>${escapeHtml(day.date)}</td>
        <td>${day.kcal.toLocaleString('ja-JP')}</td>
        <td>${day.protein}</td>
        <td>${day.fat}</td>
        <td>${day.carb}</td>
        <td>${day.salt}</td>
        <td class="${signClass(balance)}">${formatSignedInt(balance)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="analytics-table-wrap">
      <table class="analytics-table">
        <thead>
          <tr>
            <th>日付</th><th>kcal</th><th>タンパク質</th><th>脂質</th><th>糖質</th><th>塩分</th><th>収支</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}
```

- [ ] **Step 3: `renderBody` を書き換えてグラフと表を出す**

`renderAnalyticsView` の中の `renderBody` を以下に置き換える。

```javascript
  function renderBody() {
    const stats = calcPeriodStats(state.dailyTotals, goals.expenditureKcal);
    body.innerHTML = renderSummary(stats, goals, state.from, state.to)
      + `<h3 class="analytics-heading">推移</h3>`
      + renderTabs(state.metric)
      + renderChartSection(state, goals)
      + `<h3 class="analytics-heading">日別</h3>`
      + renderTable(state.dailyTotals, goals.expenditureKcal);
  }
```

- [ ] **Step 4: 栄養素タブのイベントを結線する**

`renderAnalyticsView` の中、プリセットボタンの `forEach` の直前に追加する。`renderBody` が毎回 `innerHTML` を差し替えてタブのボタンごと作り直すため、個別のボタンではなく `body` に委譲する。

```javascript
  body.addEventListener('click', (event) => {
    const tabBtn = event.target.closest('.analytics-tab-btn');
    if (!tabBtn) return;
    state.metric = tabBtn.dataset.metric;
    // 期間は変わっていないので取得済みデータから描き直すだけでよい。
    renderBody();
  });
```

- [ ] **Step 5: スタイルを追加する**

`style.css` の末尾に追記する。

```css
.analytics-tabs {
  display: flex;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-sm);
}

.analytics-tab-btn {
  flex: 1;
  padding: var(--spacing-xs);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

.analytics-tab-btn.is-active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
  font-weight: bold;
}

.analytics-chart {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm);
}

.line-chart {
  display: block;
  width: 100%;
  height: auto;
}

.chart-line {
  fill: none;
  stroke: var(--color-primary);
  stroke-width: 2;
}

.chart-dot { fill: var(--color-primary); }

.chart-goal-line {
  stroke: var(--color-danger);
  stroke-width: 1;
  stroke-dasharray: 4 3;
}

.chart-axis {
  stroke: var(--color-border);
  stroke-width: 1;
}

.chart-label {
  fill: var(--color-text-muted);
  font-size: 9px;
}

.analytics-table-wrap {
  overflow-x: auto;
}

.analytics-table {
  width: 100%;
  min-width: 480px;
  border-collapse: collapse;
  font-size: 0.8rem;
}

.analytics-table th,
.analytics-table td {
  padding: var(--spacing-xs);
  border-bottom: 1px solid var(--color-border);
  text-align: right;
  white-space: nowrap;
}

.analytics-table th:first-child,
.analytics-table td:first-child {
  text-align: left;
}

.analytics-table thead th {
  color: var(--color-text-muted);
  font-weight: normal;
}

.analytics-table .is-surplus { color: var(--color-danger); }
.analytics-table .is-deficit { color: var(--color-primary); }
```

- [ ] **Step 6: 全テストを実行する**

```bash
node --test tests/*.test.js
```

Expected: PASS 67 件、FAIL 0 件。

- [ ] **Step 7: ブラウザで手動確認する**

新しいポートで起動する。

```bash
python -m http.server 8933
```

`http://localhost:8933` を開き、分析タブで以下を確認する。確認には記録が 3 日以上、かつ**途中に記録の無い日を1日以上挟んだ状態**が必要。無ければ「今日の記録」の日付ナビで日を飛ばしながら数件登録する。

1. 折れ線グラフが表示され、点が日付の位置に並んでいる
2. 記録の無い日を挟んだところは、線が長く伸びたギャップになっている
3. 赤い破線の目標線と「目標 ◯kcal」のラベルが出ている
4. 栄養素タブを切り替えると線・目標線・上端の値が変わり、選択中のタブが緑色になる
5. y 軸の下端が 0、上端が切りのいい値になっている
6. 日別テーブルが日付の新しい順で並んでいる
7. 収支の列がプラス／マイナスで色分けされている
8. スマホ幅（ブラウザの開発者ツールで 375px）にしても、表だけが横スクロールし、ページ全体は横スクロールしない

- [ ] **Step 8: コミット**

```bash
git add js/analyticsView.js style.css
git commit -m "feat: 分析タブに栄養素別の折れ線グラフと日別テーブルを追加する"
```

---

### Task 7: Service Worker のキャッシュ更新と最終確認

**Files:**
- Modify: `sw.js:1`（`CACHE_NAME`）、`sw.js:2-19`（`ASSETS`）
- Modify: `README.md`

**Interfaces:**
- Consumes: なし
- Produces: なし

`sw.js` は cache-first のため、新規ファイルを `ASSETS` に足したうえで `CACHE_NAME` を上げないと、オフライン時に新しい JS が取得できない。

- [ ] **Step 1: `sw.js` を更新する**

`sw.js:1-19` を以下に置き換える。

```javascript
const CACHE_NAME = 'calorie-app-v5';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './data/mext-foods.json',
  './data/kurume-dishes.json',
  './js/app.js',
  './js/db.js',
  './js/nutrition.js',
  './js/foodSearch.js',
  './js/mextTable.js',
  './js/dishTable.js',
  './js/render.js',
  './js/mealForm.js',
  './js/foodForm.js',
  './js/settings.js',
  './js/dateUtils.js',
  './js/analytics.js',
  './js/lineChart.js',
  './js/analyticsView.js',
];
```

- [ ] **Step 2: `README.md` に分析タブの説明を追記する**

`README.md` の `## テスト` セクションの直前に、以下を新しいセクションとして挿入する。

```markdown
## 分析タブ

期間を指定して、記録の推移を表と折れ線グラフで振り返れます。

- 期間は「直近7日 / 30日 / 90日」のプリセット、または開始日・終了日の指定
- 栄養素5項目の1日あたり平均と、目標に対する割合
- カロリー収支（摂取 − 消費）と、その体脂肪換算（1kg ≈ 7200kcal）
- 栄養素を切り替えられる折れ線グラフ（目標値の水平線つき）
- 日別の一覧表

消費カロリーは設定タブで手入力する1日あたりの固定値です。既定は 2000 kcal で、
どの値で計算したかは分析画面に常に表示されます。

記録が1件も無い日は「記録し忘れ」とみなし、平均の分母にも収支の日数にも含めません。
```

- [ ] **Step 3: 全テストを実行する**

```bash
node --test tests/*.test.js
```

Expected: PASS 67 件、FAIL 0 件。

- [ ] **Step 4: Service Worker の更新をブラウザで確認する**

新しいポートで起動する。

```bash
python -m http.server 8934
```

`http://localhost:8934` を開き、開発者ツールのコンソールで以下を実行してキャッシュを完全に消してから再読み込みする。

```javascript
navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
caches.keys().then((ks) => ks.forEach((k) => caches.delete(k)));
```

再読み込み後、以下を確認する。

1. 開発者ツールの Application → Cache Storage に `calorie-app-v5` が1つだけあり、`calorie-app-v4` が残っていない
2. `calorie-app-v5` の中に `js/dateUtils.js` `js/analytics.js` `js/lineChart.js` `js/analyticsView.js` が入っている
3. 開発者ツールの Network タブで Offline にチェックを入れて再読み込みしても、分析タブが正常に動く

- [ ] **Step 5: 既存機能の回帰を確認する**

同じページで以下を確認する。

1. 「今日の記録」で前日・翌日のナビが動く（Task 1 で `shiftDate` を移動したため）
2. 食事の追加・編集・削除ができる
3. 「前日の内容を転記する」が動く
4. 「食品管理」で成分表・料理からの検索と登録ができる
5. 「設定」で栄養目標と消費カロリーを保存でき、再読み込み後も残る

- [ ] **Step 6: コミット**

```bash
git add sw.js README.md
git commit -m "feat: 分析タブのファイルをService Workerのキャッシュに追加しREADMEを更新する"
```

---

## 完了条件

- `node --test tests/*.test.js` が 67 件 PASS、FAIL 0 件
- 分析タブで期間を切り替えると、サマリー・グラフ・表がすべて追随する
- 消費カロリーを設定タブで変更すると、収支と体脂肪換算に反映される
- オフラインでも分析タブが動く
- 既存の記録・食品管理・設定の機能が壊れていない
