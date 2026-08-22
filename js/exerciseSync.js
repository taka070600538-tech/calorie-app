// 運動管理アプリ(exercise-app)のIndexedDBを読み、ジョギング時間から消費カロリーを推定する。
// 同一オリジンで公開されている別PWAのDBを参照するための連携モジュール。

export const EXERCISE_DB_NAME = 'exercise-app-db';
export const EXERCISE_STORE = 'records';
export const JOGGING_KCAL_PER_HOUR = 400;
// 基礎代謝(kcal/日)。手入力を廃止し、固定値として扱う。
export const BASAL_KCAL = 2000;

export class ExerciseDbNotFoundError extends Error {
  constructor() {
    super('運動管理アプリのデータが見つかりません。同じ端末の同じブラウザで運動管理アプリを一度開いて記録してください。');
    this.name = 'ExerciseDbNotFoundError';
  }
}

// 純粋関数: records配列から日付ごとのジョギング消費カロリーのMapを作る。
export function calcJoggingKcalByDate(records, kcalPerHour = JOGGING_KCAL_PER_HOUR) {
  const kcalByDate = new Map();
  for (const record of records ?? []) {
    if (!record) continue;
    const durationMin = record.jogging?.durationMin;
    if (typeof durationMin !== 'number' || !Number.isFinite(durationMin) || durationMin <= 0) continue;
    kcalByDate.set(record.date, Math.round((durationMin / 60) * kcalPerHour));
  }
  return kcalByDate;
}

// 指定日の運動消費カロリーを取得する。記録が無ければ0。
export function exerciseKcalOn(kcalByDate, date) {
  return kcalByDate.get(date) ?? 0;
}

// 運動管理アプリのDBを読み、日付ごとの運動消費カロリーMapを返す。
// DBが無い/読めない場合はthrowせず、availableをfalseにして空Mapを返す。
export async function loadExerciseKcalByDate() {
  try {
    const records = await readExerciseRecords();
    return { kcalByDate: calcJoggingKcalByDate(records), available: true };
  } catch (err) {
    console.warn('運動管理アプリのデータを読み込めませんでした。運動は0kcalとして計算します。', err);
    return { kcalByDate: new Map(), available: false };
  }
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
