import { getAllFoods, getAllMeals, getGoals } from './db.js';

export function buildBackupPayload({ foods, meals, goals }, now = new Date()) {
  return { version: 1, exportedAt: now.toISOString(), foods, meals, goals };
}

export function validateBackupData(data) {
  if (!data || data.version !== 1) throw new Error('バックアップデータの形式が不正です(version)');
  if (!Array.isArray(data.foods)) throw new Error('バックアップデータの形式が不正です(foods)');
  if (!Array.isArray(data.meals)) throw new Error('バックアップデータの形式が不正です(meals)');
  if (typeof data.goals !== 'object' || data.goals === null) throw new Error('バックアップデータの形式が不正です(goals)');
  return data;
}

export async function collectBackup(db) {
  const [foods, meals, goals] = await Promise.all([getAllFoods(db), getAllMeals(db), getGoals(db)]);
  return buildBackupPayload({ foods, meals, goals });
}

export async function restoreBackup(db, data) {
  validateBackupData(data);
  const tx = db.transaction(['foods', 'meals', 'goals'], 'readwrite');
  tx.objectStore('foods').clear();
  tx.objectStore('meals').clear();
  tx.objectStore('goals').clear();
  for (const food of data.foods) tx.objectStore('foods').put(food);
  for (const meal of data.meals) tx.objectStore('meals').put(meal);
  tx.objectStore('goals').put({ ...data.goals, id: 'default' });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
