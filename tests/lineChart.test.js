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
