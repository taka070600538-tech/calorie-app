export function searchFoods(foods, query) {
  const trimmed = query.trim();
  if (trimmed === '') return [];
  const lower = trimmed.toLowerCase();
  return foods.filter((food) => food.name.toLowerCase().includes(lower));
}
