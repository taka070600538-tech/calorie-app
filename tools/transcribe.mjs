// app-data/calorie-app/backup.json を読み、Obsidianデイリーノートに転記する。
// マーカー区間を冪等にupsertするため、再実行のたびに最新内容へ自己修復される。
// 日本語パスはこのファイル(UTF-8)内に持つ(.ps1に書くと文字化けするため)。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const START = '<!-- calorie-app:start -->';
const END = '<!-- calorie-app:end -->';
const DEFAULT_BACKUP = String.raw`D:\Obsidian Vault for Claude Code\Git\app-data\calorie-app\backup.json`;
const DEFAULT_DIARY_DIR = String.raw`D:\Obsidian Vault for Claude Code\01_油田`;

export function todayString(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// mealType → 表示名。未知の値はそのまま表示する。
const MEAL_TYPE_LABELS = {
  breakfast: '朝食',
  lunch: '昼食',
  dinner: '夕食',
  snack: '間食',
};

// 食事区分の表示順(未知の値は登場順で末尾に追加する)。
const MEAL_TYPE_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];

// 浮動小数点誤差を避けるため、表示直前に小数1桁へ四捨五入する。
function round1(n) {
  return Math.round(n * 10) / 10;
}

// その日のmealsを集計してカロリー記録セクションを組み立てる。
// 合計行(kcal整数・栄養素は小数1桁) + 固有栄養素の日合計行(DHA等、あれば)
// + 食事区分別のkcalと食事内容(食品名+量)。その日のmealsが無ければnull。
// foodNamesはfoodId→食品名のMap(食品マスタに無いIDは「不明な食品」と表示)。
export function buildDaySection(meals, date, foodNames = new Map()) {
  const dayMeals = meals.filter((m) => m.date === date);
  if (dayMeals.length === 0) return null;

  const total = { kcal: 0, protein: 0, fat: 0, carb: 0, salt: 0 };
  const byType = new Map(); // mealType → { kcal, items: ['食品名 量g', ...] }
  const extras = new Map(); // "名前|単位" → { name, unit, amount }
  for (const m of dayMeals) {
    total.kcal += m.kcal ?? 0;
    total.protein += m.protein ?? 0;
    total.fat += m.fat ?? 0;
    total.carb += m.carb ?? 0;
    total.salt += m.salt ?? 0;
    if (!byType.has(m.mealType)) byType.set(m.mealType, { kcal: 0, items: [] });
    const entry = byType.get(m.mealType);
    entry.kcal += m.kcal ?? 0;
    const name = foodNames.get(m.foodId) ?? '不明な食品';
    entry.items.push(m.amountGrams != null ? `${name} ${round1(m.amountGrams)}g` : name);
    for (const ex of m.extras ?? []) {
      const key = `${ex.name}|${ex.unit}`;
      if (!extras.has(key)) extras.set(key, { name: ex.name, unit: ex.unit, amount: 0 });
      extras.get(key).amount += ex.amount ?? 0;
    }
  }

  const totalLine =
    `- 合計: ${Math.round(total.kcal)}kcal ` +
    `(たんぱく質${round1(total.protein)}g / 脂質${round1(total.fat)}g / ` +
    `炭水化物${round1(total.carb)}g / 塩分${round1(total.salt)}g)`;

  // DHA・EPAなど、食品に登録された固有栄養素の日合計(登場順)。
  const extraLine = extras.size > 0
    ? `- 固有栄養素: ${[...extras.values()]
        .map((e) => `${e.name} ${round1(e.amount)}${e.unit}`)
        .join(' / ')}`
    : null;

  // 既知の並び順(朝食→昼食→夕食→間食)を優先し、未知のmealTypeは登場順で末尾に追加する。
  const knownTypes = MEAL_TYPE_ORDER.filter((t) => byType.has(t));
  const unknownTypes = [...byType.keys()].filter((t) => !MEAL_TYPE_ORDER.includes(t));
  const mealLines = [...knownTypes, ...unknownTypes].map((t) => {
    const label = MEAL_TYPE_LABELS[t] ?? t;
    const { kcal, items } = byType.get(t);
    return `- ${label}: ${Math.round(kcal)}kcal — ${items.join('、')}`;
  });

  return ['## カロリー記録', '', totalLine, ...(extraLine ? [extraLine] : []), ...mealLines].join('\n');
}

// contentの改行スタイルを保ちながら、マーカー区間を冪等に置換(無ければ末尾に追記)する。
// 日記本文の他の部分には一切触れない。
export function upsertSection(content, section) {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const block = `${START}${eol}${section.replaceAll('\n', eol)}${eol}${END}${eol}`;
  const startIdx = content.indexOf(START);
  const endIdx = content.indexOf(END);
  if (startIdx !== -1 && endIdx !== -1) {
    return content.slice(0, startIdx) + block + content.slice(endIdx + END.length).replace(/^\r?\n/, '');
  }
  if (content === '') return block;
  const sep = content.endsWith(eol) ? eol : eol + eol;
  return content + sep + block;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 転記対象の日付(当日より前かつYYYY-MM-DD形式のみ)。mealsのある日を昇順で返す。
export function datesToTranscribe(meals, today) {
  const dates = new Set(meals.map((m) => m.date));
  return [...dates].filter((d) => DATE_RE.test(d) && d < today).sort();
}

// foods配列からfoodId→食品名のMapを作る(foodsが無ければ空Map)。
export function buildFoodNames(foods) {
  return new Map((Array.isArray(foods) ? foods : []).map((f) => [f.id, f.name]));
}

// diaryDir配下の各日付ファイルへ、backup.json記載の内容をupsertする。
// action: 'created'(新規ファイル) / 'updated'(内容変更あり) / 'unchanged'(差分なし) / 'error'
export function runTranscription({ meals, foodNames = new Map(), diaryDir, today }) {
  const results = [];
  for (const date of datesToTranscribe(meals, today)) {
    const section = buildDaySection(meals, date, foodNames);
    if (!section) continue;
    const path = join(diaryDir, `スマホ - ${date}.md`);
    try {
      const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
      const next = upsertSection(existing, section);
      if (existing === next) {
        results.push({ date, action: 'unchanged' });
      } else {
        writeFileSync(path, next, 'utf8');
        results.push({ date, action: existing === '' ? 'created' : 'updated' });
      }
    } catch (err) {
      results.push({ date, action: 'error', message: err.message });
    }
  }
  return results;
}

function main() {
  const backupPath = process.argv[2] || DEFAULT_BACKUP;
  const diaryDir = process.argv[3] || DEFAULT_DIARY_DIR;
  if (!existsSync(backupPath)) {
    console.log('backup.jsonがまだありません。スキップします');
    return;
  }
  let meals;
  let foodNames;
  try {
    const data = JSON.parse(readFileSync(backupPath, 'utf8'));
    meals = Array.isArray(data.meals) ? data.meals : null;
    foodNames = buildFoodNames(data.foods);
  } catch (err) {
    console.log(`backup.jsonを読めません (${err.message})`);
    return;
  }
  if (!meals) {
    console.log('backup.jsonにmealsがありません。スキップします');
    return;
  }
  mkdirSync(diaryDir, { recursive: true });
  const results = runTranscription({ meals, foodNames, diaryDir, today: todayString() });
  for (const r of results) {
    console.log(r.action === 'error' ? `${r.date}: ERROR (${r.message})` : `${r.date}: ${r.action}`);
  }
  if (results.length === 0) console.log('転記対象なし');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
