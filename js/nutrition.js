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
