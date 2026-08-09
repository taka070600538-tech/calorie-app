const TABLE_URL = 'data/kurume-dishes.json';

// 約100KB弱のJSONを起動時に読むとダッシュボードの初期表示が遅くなるため、
// 食品管理画面を開いたときに初めて読み込み、以後はメモリ上に保持する。
let cachedTable = null;
let inflightRequest = null;

export async function loadDishTable() {
  if (cachedTable) return cachedTable;
  if (inflightRequest) return inflightRequest;

  inflightRequest = (async () => {
    try {
      const response = await fetch(TABLE_URL);
      if (!response.ok) {
        throw new Error(`料理データの取得に失敗しました (${response.status})`);
      }
      cachedTable = await response.json();
      return cachedTable;
    } finally {
      inflightRequest = null;
    }
  })();

  return inflightRequest;
}

export function searchDishes(table, query, limit = 50) {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === '') return [];

  const prefixMatches = [];
  const otherMatches = [];

  for (const dish of table) {
    const name = dish.name.toLowerCase();
    if (name.startsWith(trimmed)) {
      prefixMatches.push(dish);
    } else if (name.includes(trimmed)) {
      otherMatches.push(dish);
    }
    if (prefixMatches.length >= limit) break;
  }

  return [...prefixMatches, ...otherMatches].slice(0, limit);
}
