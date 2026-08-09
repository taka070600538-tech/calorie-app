import unittest

from build_dish_database import (
    calc_per100g,
    ingredient_weight_total,
    is_unreliable_conversion,
    number_categories,
    parse_ingredients,
    validate_header,
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

    def test_non_numeric_weight_raises_value_error(self):
        # 「少々」「適量」のような重量欄は数値変換できずクラッシュしていた(修正3)
        row = pad_row([
            "調味料", "テスト", "0", "0", "0", "0", "0", "0",
            "こしょう", "少々",
        ])
        with self.assertRaises(ValueError):
            parse_ingredients(row)


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

    def test_non_numeric_per_serving_value_raises_value_error(self):
        # 「適量」のような栄養値欄は数値変換できずクラッシュしていた(修正3)
        per_serving = {
            "kcal": "適量", "protein": "1", "fat": "1", "carb": "1", "salt": "1",
        }
        with self.assertRaises(ValueError):
            calc_per100g(per_serving, 100.0)


class TestIsUnreliableConversion(unittest.TestCase):
    # --- パターン1: 乾物・生の主食(米・麺)ベースで過大評価される料理 ---

    def test_flags_mugi_gohan_raw_rice_and_barley(self):
        # 久留米市データの実例(K002 麦ごはん): 米・精白米(生)+大麦・押麦のみ、
        # 材料重量合計70gで割ると per100g kcal=354.3 まで跳ね上がる。
        ingredients = [("米・精白米（水稲）", 60.0), ("大麦・押麦", 10.0)]
        per100g = {"kcal": 354.3, "protein": 6.1, "fat": 1.0, "carb": 77.1, "salt": 0.0}
        self.assertTrue(is_unreliable_conversion("ごはん", ingredients, per100g))

    def test_flags_carbonara_dry_pasta(self):
        # 久留米市データの実例(K049 カルボナーラスパゲティ): 乾燥パスタ使用で
        # per100g kcal=434.2 まで跳ね上がる。
        ingredients = [
            ("マカロニ・スパゲッティ＿乾", 85.0),
            ("豚・ベーコン・ベーコン", 30.0),
            ("鶏卵・全卵＿生", 18.0),
        ]
        per100g = {"kcal": 434.2, "protein": 11.0, "fat": 26.2, "carb": 35.4, "salt": 2.2}
        self.assertTrue(is_unreliable_conversion("麺", ingredients, per100g))

    def test_does_not_flag_dry_pasta_when_kcal_is_plausible(self):
        # 久留米市データの実例(K048 ミートソーススパゲティ): 乾燥パスタを含むが
        # per100g kcal=227.7で、他の食材が重量を占めるため実態からの乖離が小さい。
        # 誤検出を避けるため、閾値未満なら除外しない。
        ingredients = [
            ("マカロニ・スパゲッティ＿乾", 85.0),
            ("牛・ひき肉＿生", 70.0),
            ("たまねぎ・りん茎＿生", 45.0),
        ]
        per100g = {"kcal": 227.7, "protein": 9.3, "fat": 7.5, "carb": 28.8, "salt": 1.5}
        self.assertFalse(is_unreliable_conversion("麺", ingredients, per100g))

    def test_does_not_flag_seasoning_category_even_if_kcal_high(self):
        # 調味料は1回分の使用量が少なくper100g kcalが高いのが正常(例: あめ玉)。
        # 乾物マーカーが無いのでそもそも該当しないが、防御的に確認する。
        ingredients = [("あめ玉", 3.0)]
        per100g = {"kcal": 400.0, "protein": 0.0, "fat": 0.0, "carb": 99.5, "salt": 0.0}
        self.assertFalse(is_unreliable_conversion("調味料", ingredients, per100g))

    def test_does_not_flag_normal_high_kcal_dish_without_raw_staple(self):
        # 久留米市データの実例(K233 ポテトチップ): 乾物主食マーカーが無いので、
        # per100g kcalが高くても正常な料理として扱う。
        ingredients = [("ポテトチップス", 60.0)]
        per100g = {"kcal": 553.3, "protein": 4.7, "fat": 35.3, "carb": 54.0, "salt": 0.7}
        self.assertFalse(is_unreliable_conversion("菓子", ingredients, per100g))

    def test_does_not_flag_oyakodon_cooked_rice(self):
        # 正常系(親子丼): 「めし・精白米」は炊いた後の重量なので対象外。
        ingredients = [
            ("めし・精白米（水稲）", 260.0),
            ("若鶏・もも、皮なし＿生", 75.0),
            ("たまねぎ・りん茎＿生", 60.0),
            ("かつおだし", 25.0),
            ("こいくちしょうゆ", 12.0),
            ("鶏卵・全卵＿生", 50.0),
        ]
        per100g = {"kcal": 132.5, "protein": 5.7, "fat": 1.8, "carb": 22.1, "salt": 0.4}
        self.assertFalse(is_unreliable_conversion("ごはん", ingredients, per100g))

    def test_does_not_flag_plain_rice_bowl(self):
        # 正常系(ごはん(中茶碗1杯)): 炊いた後の「めし」のみ。
        ingredients = [("めし・精白米（水稲）", 150.0)]
        per100g = {"kcal": 168.0, "protein": 2.5, "fat": 0.3, "carb": 37.1, "salt": 0.0}
        self.assertFalse(is_unreliable_conversion("ごはん", ingredients, per100g))

    # --- パターン2: だし・水分の記載が無い汁物 ---

    def test_flags_soup_without_liquid_marker(self):
        # 久留米市データの実例(K191 あさりのみそ汁): だし・水・牛乳に類する
        # 材料が無く、具材と味噌の重量だけで割るとsalt=4.6まで跳ね上がる。
        ingredients = [
            ("あさり＿生", 25.0),
            ("こねぎ・葉＿生", 3.0),
            ("米みそ・淡色辛みそ", 9.0),
        ]
        per100g = {"kcal": 70.3, "protein": 7.3, "fat": 1.6, "carb": 5.9, "salt": 4.6}
        self.assertTrue(is_unreliable_conversion("汁物＿和風", ingredients, per100g))

    def test_flags_consomme_soup_without_liquid_marker(self):
        # 久留米市データの実例(K205 じゃがいものコンソメスープ): 固形コンソメは
        # 溶かす水が別途必要なので、それ単体では水分とみなさない。
        ingredients = [
            ("じゃがいも＿生", 30.0),
            ("にんじん・根、皮つき＿生", 10.0),
            ("固形コンソメ", 2.0),
            ("食塩", 0.3),
        ]
        per100g = {"kcal": 65.7, "protein": 1.7, "fat": 0.2, "carb": 14.3, "salt": 2.3}
        self.assertTrue(is_unreliable_conversion("汁物＿その他", ingredients, per100g))

    def test_does_not_flag_soup_with_dashi(self):
        # 正常系(豚汁): 「煮干しだし」があるので実態からの乖離は小さい。
        ingredients = [
            ("豚・もも・脂身つき＿生", 20.0),
            ("大根・根、皮つき＿生", 30.0),
            ("煮干しだし", 150.0),
            ("米みそ・淡色辛みそ", 5.0),
            ("こねぎ・葉＿生", 3.0),
        ]
        per100g = {"kcal": 39.0, "protein": 2.3, "fat": 1.0, "carb": 5.1, "salt": 0.4}
        self.assertFalse(is_unreliable_conversion("汁物＿和風", ingredients, per100g))

    def test_does_not_flag_soup_with_milk(self):
        # 久留米市データの実例(K204 春キャベツの具沢山ミルクスープ): 乾燥パスタを
        # 含むが、普通牛乳があるので水分不足パターンには該当しない。
        ingredients = [
            ("キャベツ＿生", 25.0),
            ("じゃがいも＿生", 40.0),
            ("固形コンソメ", 2.0),
            ("マカロニ・スパゲッティ＿乾", 7.0),
            ("普通牛乳", 30.0),
        ]
        per100g = {"kcal": 84.4, "protein": 2.8, "fat": 1.4, "carb": 15.2, "salt": 0.8}
        self.assertFalse(is_unreliable_conversion("汁物＿その他", ingredients, per100g))

    def test_none_per100g_is_not_flagged(self):
        self.assertFalse(is_unreliable_conversion("汁物＿和風", [], None))


class TestValidateHeader(unittest.TestCase):
    VALID_HEADER = pad_row([
        "料理の種類", "料理名", "エネルギー[キロカロリー]", "たんぱく質[グラム]",
        "脂質[グラム]", "炭水化物[グラム]", "食塩相当量[グラム]", "野菜量[グラム]",
    ])

    def test_accepts_expected_header(self):
        validate_header(self.VALID_HEADER)  # 例外が出なければOK

    def test_rejects_reordered_columns(self):
        bad_header = pad_row([
            "料理名", "料理の種類", "エネルギー[キロカロリー]", "たんぱく質[グラム]",
            "脂質[グラム]", "炭水化物[グラム]", "食塩相当量[グラム]", "野菜量[グラム]",
        ])
        with self.assertRaises(ValueError):
            validate_header(bad_header)

    def test_rejects_missing_column(self):
        bad_header = pad_row([
            "料理の種類", "料理名", "たんぱく質[グラム]",
            "脂質[グラム]", "炭水化物[グラム]", "食塩相当量[グラム]", "野菜量[グラム]",
        ])
        with self.assertRaises(ValueError):
            validate_header(bad_header)


class TestNumberCategories(unittest.TestCase):
    def test_assigns_sequential_numbers_by_first_appearance(self):
        sequence = ["ごはん", "ごはん", "パン", "麺", "パン"]
        self.assertEqual(number_categories(sequence), {"ごはん": 1, "パン": 2, "麺": 3})

    def test_single_category(self):
        self.assertEqual(number_categories(["調味料", "調味料"]), {"調味料": 1})


if __name__ == "__main__":
    unittest.main()
