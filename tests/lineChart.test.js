import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLineChartSvg } from '../js/lineChart.js';

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

// y軸上端(y=20)・下端(y=156)のラベル文字列を取り出す
function extractAxisLabel(svg, y) {
  const re = new RegExp(`<text class="chart-label" x="34" y="${y}" text-anchor="end">([^<]+)</text>`);
  const m = svg.match(re);
  return m ? m[1] : null;
}

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
  // 上端と下端が同じ0になる退行ケースでは、上端に1を足して潰れを防ぐ。
  assert.equal(extractAxisLabel(svg, 20), '1');
  assert.equal(extractAxisLabel(svg, 156), '0');
});

test('buildLineChartSvg: 上端は表示期間の最高値の110%、下端は最低値の90%になる(目標値は範囲内)', () => {
  const svg = buildLineChartSvg(
    [
      { date: '2026-08-01', value: 1000 },
      { date: '2026-08-02', value: 2000 },
    ],
    { goalValue: 1500, unit: 'kcal', fromDate: '2026-08-01', toDate: '2026-08-02' }
  );
  // 上端 = 2000 * 1.10 = 2200、下端 = 1000 * 0.90 = 900
  assert.equal(extractAxisLabel(svg, 20), '2200');
  assert.equal(extractAxisLabel(svg, 156), '900');
  // 下端が0まで引き下げられなくなった(=ズームされた)ことを、最低値の点が
  // 描画領域の最下端(y=156)より上にあることで確認する。
  const points = extractPolylinePoints(svg);
  const minPoint = points.find((p) => p.x === 40);
  assert.ok(minPoint.y < 156, `minPoint.y=${minPoint.y} は下端に張り付いたまま`);
});

test('buildLineChartSvg: 目標値が範囲の下限より低いとき下限が目標値まで拡張される', () => {
  const svg = buildLineChartSvg(
    [
      { date: '2026-08-01', value: 2000 },
      { date: '2026-08-02', value: 2200 },
    ],
    // 最低値の90% = 1800 より低い目標値
    { goalValue: 1500, unit: 'kcal', fromDate: '2026-08-01', toDate: '2026-08-02' }
  );
  assert.equal(extractAxisLabel(svg, 156), '1500');
  // 目標値がそのまま下端になるため、目標線は描画領域の下端(156)以内に収まる
  assert.ok(extractGoalLineY(svg) <= 156);
});

test('buildLineChartSvg: 目標値が範囲の上限より高いとき上限が目標値まで拡張される', () => {
  const svg = buildLineChartSvg(
    [
      { date: '2026-08-01', value: 1800 },
      { date: '2026-08-02', value: 1900 },
    ],
    // 最高値の110% = 2090 より高い目標値
    { goalValue: 2500, unit: 'kcal', fromDate: '2026-08-01', toDate: '2026-08-02' }
  );
  assert.equal(extractAxisLabel(svg, 20), '2500');
  // 目標値がそのまま上端になるため、目標線は描画領域の上端(16)以内に収まる
  assert.ok(extractGoalLineY(svg) >= 16);
});

test('buildLineChartSvg: viewBoxとwidth=100%を持ちレスポンシブになる', () => {
  const svg = buildLineChartSvg(
    [{ date: '2026-08-01', value: 100 }],
    { goalValue: 100, unit: 'g', fromDate: '2026-08-01', toDate: '2026-08-01' }
  );
  assert.ok(svg.includes('viewBox="0 0 320 180"'));
  assert.ok(svg.includes('width="100%"'));
});
