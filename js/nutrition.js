export function calcNutrientsForAmount(per100g, amountGrams) {
  const ratio = amountGrams / 100;
  return {
    kcal: Math.round(per100g.kcal * ratio),
    protein: Math.round(per100g.protein * ratio * 10) / 10,
    fat: Math.round(per100g.fat * ratio * 10) / 10,
    carb: Math.round(per100g.carb * ratio * 10) / 10,
    salt: Math.round(per100g.salt * ratio * 10) / 10,
  };
}

export function sumNutrients(list) {
  return list.reduce(
    (total, item) => ({
      kcal: total.kcal + item.kcal,
      protein: Math.round((total.protein + item.protein) * 10) / 10,
      fat: Math.round((total.fat + item.fat) * 10) / 10,
      carb: Math.round((total.carb + item.carb) * 10) / 10,
      salt: Math.round((total.salt + item.salt) * 10) / 10,
    }),
    { kcal: 0, protein: 0, fat: 0, carb: 0, salt: 0 }
  );
}

export function calcProgress(currentValue, goalValue) {
  if (!goalValue || goalValue <= 0) return 0;
  return Math.round((currentValue / goalValue) * 100);
}

export function calcExtrasForAmount(extraNutrients, amountGrams) {
  return (extraNutrients ?? []).map((n) => ({
    name: n.name,
    unit: n.unit,
    // amountGrams を先に乗算してから100で割ることで浮動小数の丸め誤差を避ける
    // (per100g * (amountGrams / 100) の順だと 33.3 * 1.5 = 49.949999999999996 になり、
    //  期待値50に対してMath.roundが49.9に丸めてしまうケースがあるため)
    amount: Math.round(((n.per100g * amountGrams) / 100) * 10) / 10,
  }));
}

export function sumExtras(meals) {
  const totals = new Map();
  for (const meal of meals) {
    for (const extra of meal.extras ?? []) {
      const current = totals.get(extra.name);
      if (current) {
        current.amount = Math.round((current.amount + extra.amount) * 10) / 10;
      } else {
        totals.set(extra.name, { ...extra });
      }
    }
  }
  return [...totals.values()].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}
