// 運動管理アプリ(exercise-app)のIndexedDBを読み、ジョギング時間から消費カロリーを推定する。
// 同一オリジンで公開されている別PWAのDBを参照するための連携モジュール。
import { calcPresetRange } from './dateUtils.js';

export const EXERCISE_DB_NAME = 'exercise-app-db';
export const EXERCISE_STORE = 'records';
export const JOGGING_KCAL_PER_HOUR = 400;
export const SYNC_PERIOD_DAYS = 30;

export class ExerciseDbNotFoundError extends Error {
  constructor() {
    super('運動管理アプリのデータが見つかりません。同じ端末の同じブラウザで運動管理アプリを一度開いて記録してください。');
    this.name = 'ExerciseDbNotFoundError';
  }
}

// 純粋関数: records配列から直近days日間のジョギング時間の合計・平均消費カロリーを求める。
export function calcJoggingKcalPerDay(records, today, days = SYNC_PERIOD_DAYS, kcalPerHour = JOGGING_KCAL_PER_HOUR) {
  const { from, to } = calcPresetRange(today, days);
  let totalMin = 0;
  let joggingDays = 0;
  for (const record of records ?? []) {
    if (!record || record.date < from || record.date > to) continue;
    const durationMin = record.jogging?.durationMin;
    if (typeof durationMin !== 'number' || !Number.isFinite(durationMin) || durationMin <= 0) continue;
    totalMin += durationMin;
    joggingDays += 1;
  }
  const kcalPerDay = Math.round((totalMin / 60) * kcalPerHour / days);
  return { from, to, days, joggingDays, totalMin, kcalPerDay };
}

// 運動管理アプリのIndexedDBから全レコードを読み出す。
// DBが存在しない場合(=運動管理アプリを一度も開いていない)は ExerciseDbNotFoundError で reject する。
export function readExerciseRecords() {
  return new Promise((resolve, reject) => {
    let notFound = false;
    const request = indexedDB.open(EXERCISE_DB_NAME);

    request.onupgradeneeded = (event) => {
      // バージョン指定なしでopenした際にonupgradeneededが発火するのは、
      // DBがまだ存在せず新規作成されようとしている場合。作成を中止する。
      notFound = true;
      event.target.transaction.abort();
    };

    request.onsuccess = () => {
      if (notFound) return; // abort後のonsuccessは発火しないはずだが念のため無視
      const db = request.result;
      if (!db.objectStoreNames.contains(EXERCISE_STORE)) {
        db.close();
        reject(new ExerciseDbNotFoundError());
        return;
      }
      const tx = db.transaction(EXERCISE_STORE, 'readonly');
      const store = tx.objectStore(EXERCISE_STORE);
      const getAllRequest = store.getAll();
      getAllRequest.onsuccess = () => {
        resolve(getAllRequest.result);
        db.close();
      };
      getAllRequest.onerror = () => {
        reject(getAllRequest.error);
        db.close();
      };
    };

    request.onerror = () => {
      reject(notFound ? new ExerciseDbNotFoundError() : request.error);
    };

    request.onblocked = () => {
      reject(notFound ? new ExerciseDbNotFoundError() : new Error('運動管理アプリのデータベースがブロックされています。'));
    };
  });
}
