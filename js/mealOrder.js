// 食事区分内の表示順。ドラッグで並べ替えた記録はorder(0始まり)を持ち、
// orderの無い記録(並べ替え前の記録や後から追加した記録)は登録順(id順)で末尾に並ぶ。
export function sortMealsForDisplay(meals) {
  return [...meals].sort((a, b) => {
    const aHas = a.order != null;
    const bHas = b.order != null;
    if (aHas && bHas && a.order !== b.order) return a.order - b.order;
    if (aHas !== bHas) return aHas ? -1 : 1;
    return a.id - b.id;
  });
}

// orderedIdsの並びどおりにorderを振り直し、保存が必要な(orderが変わった)記録だけ返す。
export function assignOrder(meals, orderedIds) {
  const byId = new Map(meals.map((m) => [m.id, m]));
  const changed = [];
  orderedIds.forEach((id, index) => {
    const meal = byId.get(id);
    if (meal && meal.order !== index) changed.push({ ...meal, order: index });
  });
  return changed;
}
