import { sumNutrients } from './nutrition.js';
import { BASAL_KCAL } from './exerciseSync.js';

// 体脂肪組織はおよそ80%がトリグリセリドなので 9kcal/g × 0.8 ≈ 7.2kcal/g、
// すなわち1kgあたり約7200kcalとして換算する。
const KCAL_PER_KG_BODY_FAT = 7200;

const ZERO_NUTRIENTS = { kcal: 0, protein: 0, fat: 0, carb: 0, salt: 0 };

export function groupMealsByDate(meals, exerciseKcalByDate = new Map()) {
  const byDate = new Map();
  for (const meal of meals) {
    if (!byDate.has(meal.date)) byDate.set(meal.date, []);
    byDate.get(meal.date).push(meal);
  }
  // 'YYYY-MM-DD' は辞書順が時系列順と一致する。
  return [...byDate.keys()]
    .sort()
    .map((date) => ({
      date,
      ...sumNutrients(byDate.get(date)),
      exerciseKcal: exerciseKcalByDate.get(date) ?? 0,
    }));
}

export function calcPeriodStats(dailyTotals, basalKcal = BASAL_KCAL) {
  const dayCount = dailyTotals.length;
  if (dayCount === 0) {
    return {
      dayCount: 0,
      averages: { ...ZERO_NUTRIENTS },
      totalIntakeKcal: 0,
      totalBasalKcal: 0,
      totalExerciseKcal: 0,
      totalExpenditureKcal: 0,
      energyBalanceKcal: 0,
      bodyFatKg: 0,
    };
  }

  const totals = sumNutrients(dailyTotals);
  const totalIntakeKcal = totals.kcal;
  const totalBasalKcal = Math.round(basalKcal * dayCount);
  const totalExerciseKcal = dailyTotals.reduce((sum, day) => sum + (day.exerciseKcal ?? 0), 0);
  const totalExpenditureKcal = Math.round(totalBasalKcal + totalExerciseKcal);
  const energyBalanceKcal = Math.round(totalIntakeKcal - totalExpenditureKcal);

  return {
    dayCount,
    averages: {
      kcal: Math.round(totals.kcal / dayCount),
      protein: Math.round((totals.protein / dayCount) * 10) / 10,
      fat: Math.round((totals.fat / dayCount) * 10) / 10,
      carb: Math.round((totals.carb / dayCount) * 10) / 10,
      salt: Math.round((totals.salt / dayCount) * 10) / 10,
    },
    totalIntakeKcal,
    totalBasalKcal,
    totalExerciseKcal,
    totalExpenditureKcal,
    energyBalanceKcal,
    bodyFatKg: Math.round((energyBalanceKcal / KCAL_PER_KG_BODY_FAT) * 100) / 100,
  };
}

// 1日単位のカロリー収支(摂取 − (基礎代謝 + 運動))を計算する。
export function dailyBalanceKcal(day, basalKcal = BASAL_KCAL) {
  return day.kcal - (basalKcal + (day.exerciseKcal ?? 0));
}
