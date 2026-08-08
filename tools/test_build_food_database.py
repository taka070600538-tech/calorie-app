import unittest

from build_food_database import (
    calc_sugar,
    group_name_from_sheet,
    normalize_name,
    parse_value,
)


class TestParseValue(unittest.TestCase):
    def test_numeric_cell(self):
        self.assertEqual(parse_value(343), 343.0)

    def test_float_cell(self):
        self.assertEqual(parse_value(12.3), 12.3)

    def test_numeric_string(self):
        self.assertEqual(parse_value("6.0"), 6.0)

    def test_estimated_value_in_parens(self):
        self.assertEqual(parse_value("(9.7)"), 9.7)

    def test_trace_amount(self):
        self.assertEqual(parse_value("Tr"), 0.0)

    def test_estimated_trace_amount(self):
        self.assertEqual(parse_value("(Tr)"), 0.0)

    def test_not_measured(self):
        self.assertEqual(parse_value("-"), 0.0)

    def test_value_with_dagger(self):
        self.assertEqual(parse_value("14.0†"), 14.0)

    def test_empty_string(self):
        self.assertEqual(parse_value(""), 0.0)

    def test_none(self):
        self.assertEqual(parse_value(None), 0.0)

    def test_string_without_number(self):
        self.assertEqual(parse_value("未測定"), 0.0)

    def test_whitespace_is_stripped(self):
        self.assertEqual(parse_value("  7.5  "), 7.5)


class TestCalcSugar(unittest.TestCase):
    def test_subtracts_fiber_from_carb(self):
        # 白米(めし): 炭水化物37.1 - 食物繊維1.5 = 35.6
        self.assertEqual(calc_sugar(37.1, 1.5), 35.6)

    def test_uses_carb_as_is_when_fiber_not_measured(self):
        self.assertEqual(calc_sugar(50.0, "-"), 50.0)

    def test_uses_carb_as_is_when_fiber_is_empty(self):
        self.assertEqual(calc_sugar(50.0, ""), 50.0)

    def test_uses_carb_as_is_when_fiber_is_none(self):
        self.assertEqual(calc_sugar(50.0, None), 50.0)

    def test_subtracts_when_fiber_is_trace(self):
        # Trは0として扱うので減算しても値は変わらない
        self.assertEqual(calc_sugar(50.0, "Tr"), 50.0)

    def test_clamps_negative_result_to_zero(self):
        # こんにゃくなど食物繊維が炭水化物を上回る品目
        self.assertEqual(calc_sugar(2.3, 3.0), 0.0)

    def test_rounds_away_floating_point_error(self):
        # 64.9 - 7.4 は浮動小数点では 57.50000000000001 になる(01001 アマランサス玄穀)
        self.assertEqual(calc_sugar(64.9, 7.4), 57.5)

    def test_accepts_raw_strings_for_both(self):
        self.assertEqual(calc_sugar("(9.7)", "1.2"), 8.5)


class TestNormalizeName(unittest.TestCase):
    def test_converts_ideographic_space_to_ascii_space(self):
        self.assertEqual(normalize_name("こめ　精白米"), "こめ 精白米")

    def test_collapses_consecutive_spaces(self):
        self.assertEqual(normalize_name("こめ　　精白米"), "こめ 精白米")

    def test_strips_leading_and_trailing_space(self):
        self.assertEqual(normalize_name("　あわ　精白粒　"), "あわ 精白粒")

    def test_keeps_brackets(self):
        self.assertEqual(
            normalize_name("こめ　［水稲めし］　精白米"),
            "こめ ［水稲めし］ 精白米",
        )


class TestGroupNameFromSheet(unittest.TestCase):
    def test_single_digit_prefix(self):
        self.assertEqual(group_name_from_sheet("1穀類"), "穀類")

    def test_double_digit_prefix(self):
        self.assertEqual(group_name_from_sheet("18調理済み流通食品類"), "調理済み流通食品類")

    def test_name_containing_digits_is_preserved(self):
        self.assertEqual(group_name_from_sheet("2いも及びでん粉類"), "いも及びでん粉類")


if __name__ == "__main__":
    unittest.main()
