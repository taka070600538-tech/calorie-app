import unittest

from build_dish_database import (
    calc_per100g,
    ingredient_weight_total,
    number_categories,
    parse_ingredients,
)


def pad_row(cells):
    """CSVの1行は50列固定。テスト用に末尾を空文字で埋める。"""
    return cells + [""] * (50 - len(cells))


OYAKODON_ROW = pad_row([
    "ごはん", "親子丼", "665", "28.5", "8.9", "110.7", "2.1", "65.0",
    "めし・精白米（水稲）", "260",
    "若鶏・もも、皮なし＿生", "75",
    "清酒・上撰", "3.75",
    "たまねぎ・りん茎＿生", "60",
    "かつおだし", "25",
    "こいくちしょうゆ", "12",
    "みりん風調味料", "9",
    "車糖・上白糖", "2.25",
    "鶏卵・全卵＿生", "50",
    "切りみつば・葉＿生", "5",
])


class TestParseIngredients(unittest.TestCase):
    def test_parses_all_populated_slots(self):
        ingredients = parse_ingredients(OYAKODON_ROW)
        self.assertEqual(len(ingredients), 10)
        self.assertEqual(ingredients[0], ("めし・精白米（水稲）", 260.0))
        self.assertEqual(ingredients[-1], ("切りみつば・葉＿生", 5.0))

    def test_skips_empty_slots(self):
        row = pad_row([
            "ごはん", "ごはん（中茶碗1杯）", "252", "3.8", "0.5", "55.7", "0.0", "0.0",
            "めし・精白米（水稲）", "150",
        ])
        self.assertEqual(parse_ingredients(row), [("めし・精白米（水稲）", 150.0)])

    def test_skips_slot_with_name_but_no_weight(self):
        row = pad_row([
            "調味料", "テスト", "0", "0", "0", "0", "0", "0",
            "水", "",
        ])
        self.assertEqual(parse_ingredients(row), [])

    def test_no_ingredients_returns_empty_list(self):
        row = pad_row(["調味料", "テスト", "0", "0", "0", "0", "0", "0"])
        self.assertEqual(parse_ingredients(row), [])


class TestIngredientWeightTotal(unittest.TestCase):
    def test_sums_weights(self):
        ingredients = [("a", 260.0), ("b", 75.0), ("c", 3.75)]
        self.assertEqual(ingredient_weight_total(ingredients), 338.75)

    def test_empty_list_is_zero(self):
        self.assertEqual(ingredient_weight_total([]), 0)


class TestCalcPer100g(unittest.TestCase):
    def test_oyakodon_matches_verified_values(self):
        # 久留米市の実データで検証済みの値(親子丼: 665kcal / 材料重量合計502g)
        per_serving = {
            "kcal": "665", "protein": "28.5", "fat": "8.9",
            "carb": "110.7", "salt": "2.1",
        }
        result = calc_per100g(per_serving, 502.0)
        self.assertEqual(
            result,
            {"kcal": 132.5, "protein": 5.7, "fat": 1.8, "carb": 22.1, "salt": 0.4},
        )

    def test_zero_weight_total_returns_none(self):
        per_serving = {"kcal": "100", "protein": "1", "fat": "1", "carb": "1", "salt": "1"}
        self.assertIsNone(calc_per100g(per_serving, 0))

    def test_zero_kcal_dish(self):
        # 調味料カテゴリの「塩(1つまみ)」相当のケース
        per_serving = {"kcal": "0", "protein": "0", "fat": "0", "carb": "0", "salt": "0"}
        result = calc_per100g(per_serving, 1.0)
        self.assertEqual(
            result,
            {"kcal": 0.0, "protein": 0.0, "fat": 0.0, "carb": 0.0, "salt": 0.0},
        )


class TestNumberCategories(unittest.TestCase):
    def test_assigns_sequential_numbers_by_first_appearance(self):
        sequence = ["ごはん", "ごはん", "パン", "麺", "パン"]
        self.assertEqual(number_categories(sequence), {"ごはん": 1, "パン": 2, "麺": 3})

    def test_single_category(self):
        self.assertEqual(number_categories(["調味料", "調味料"]), {"調味料": 1})


if __name__ == "__main__":
    unittest.main()
