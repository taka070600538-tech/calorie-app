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
