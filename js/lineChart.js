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

function round2(n) {
  return Math.round(n * 100) / 100;
}

// 軸ラベル表示用に小数1桁へ丸める(整数値は"2200"のように小数点無しで表示される)。
function round1(n) {
  return Math.round(n * 10) / 10;
}

function toMonthDay(dateStr) {
  const [, month, day] = dateStr.split('-');
  return `${Number(month)}/${Number(day)}`;
}

export function buildLineChartSvg(points, { goalValue, unit, fromDate, toDate }) {
  const values = points.map((p) => p.value);
  // y軸は表示期間中の最高値の110%を上端、最低値の90%を下端とする(小さな変動を見やすくするズーム表示)。
  let axisTop = Math.max(...values) * 1.1;
  let axisBottom = Math.min(...values) * 0.9;
  // 目標線が常に見えるよう、範囲外なら目標値まで拡張する。
  if (goalValue > 0) {
    if (goalValue > axisTop) axisTop = goalValue;
    if (goalValue < axisBottom) axisBottom = goalValue;
  }
  // 全点と目標値が同じ(0を含む)場合に範囲が潰れるのを防ぐ。
  if (axisTop <= axisBottom) axisTop = axisBottom + 1;
  const axisSpan = axisTop - axisBottom;

  const spanDays = diffDays(fromDate, toDate);

  const xFor = (dateStr) => {
    // 期間が1日だけなら割り算できないので中央へ置く。
    if (spanDays <= 0) return PLOT_LEFT + PLOT_WIDTH / 2;
    return PLOT_LEFT + (diffDays(fromDate, dateStr) / spanDays) * PLOT_WIDTH;
  };
  const yFor = (value) => PLOT_TOP + PLOT_HEIGHT * (1 - (value - axisBottom) / axisSpan);

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
  <text class="chart-label" x="${PLOT_LEFT - 6}" y="${PLOT_TOP + 4}" text-anchor="end">${round1(axisTop)}</text>
  <text class="chart-label" x="${PLOT_LEFT - 6}" y="${PLOT_BOTTOM}" text-anchor="end">${round1(axisBottom)}</text>
  <text class="chart-label" x="${PLOT_LEFT}" y="${VIEW_HEIGHT - 6}" text-anchor="start">${toMonthDay(fromDate)}</text>
  <text class="chart-label" x="${PLOT_RIGHT}" y="${VIEW_HEIGHT - 6}" text-anchor="end">${toMonthDay(toDate)}</text>
  ${goalLine}
  ${polyline}
  ${dots}
</svg>`;
}
