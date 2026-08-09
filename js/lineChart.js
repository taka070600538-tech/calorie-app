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
