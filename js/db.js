const DB_NAME = 'calorie-app-db';
const DB_VERSION = 1;

export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('foods')) {
        db.createObjectStore('foods', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meals')) {
        const mealsStore = db.createObjectStore('meals', { keyPath: 'id', autoIncrement: true });
        mealsStore.createIndex('by_date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains('goals')) {
        db.createObjectStore('goals', { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function seedFoodsIfEmpty(db, seedFoods) {
  const existing = await getAllFoods(db);
  if (existing.length > 0) return;
  const tx = db.transaction('foods', 'readwrite');
  const store = tx.objectStore('foods');
  for (const food of seedFoods) {
    store.put(food);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllFoods(db) {
  const tx = db.transaction('foods', 'readonly');
  const store = tx.objectStore('foods');
  return promisifyRequest(store.getAll());
}

export async function addFood(db, food) {
  const tx = db.transaction('foods', 'readwrite');
  const store = tx.objectStore('foods');
  const id = food.id || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const record = { ...food, id, source: food.source || 'custom' };
  store.put(record);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateFood(db, food) {
  const tx = db.transaction('foods', 'readwrite');
  tx.objectStore('foods').put(food);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteFood(db, id) {
  const tx = db.transaction('foods', 'readwrite');
  tx.objectStore('foods').delete(id);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMealsByDate(db, date) {
  const tx = db.transaction('meals', 'readonly');
  const store = tx.objectStore('meals');
  const index = store.index('by_date');
  return promisifyRequest(index.getAll(date));
}

export async function addMeal(db, meal) {
  const tx = db.transaction('meals', 'readwrite');
  const request = tx.objectStore('meals').add(meal);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteMeal(db, id) {
  const tx = db.transaction('meals', 'readwrite');
  tx.objectStore('meals').delete(id);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const DEFAULT_GOALS = { id: 'default', kcal: 2000, protein: 60, fat: 60, carb: 250, salt: 7.0 };

export async function getGoals(db) {
  const tx = db.transaction('goals', 'readonly');
  const result = await promisifyRequest(tx.objectStore('goals').get('default'));
  return result || DEFAULT_GOALS;
}

export async function saveGoals(db, goals) {
  const tx = db.transaction('goals', 'readwrite');
  tx.objectStore('goals').put({ ...goals, id: 'default' });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
