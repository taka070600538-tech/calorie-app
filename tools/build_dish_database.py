"""久留米市「料理の栄養価一覧」をアプリ用JSONとMarkdownに変換する。

出典: 久留米市「料理の栄養価一覧」(久留米市保健所健康推進課、CC BY)
https://data.bodik.jp/dataset/402036_0009100_00005
"""

FIRST_INGREDIENT_COLUMN = 8
INGREDIENT_SLOT_COUNT = 20
NUTRIENT_KEYS = ("kcal", "protein", "fat", "carb", "salt")


def parse_ingredients(row):
    """CSVの1行から、材料名と重量(g)のペアのリストを返す。

    材料欄は最大20スロット(材料名・重量のペア)あるが、使われていないスロットは
    両方とも空文字になっている。名前か重量のどちらかが空なら、そのスロットは
    使われていないとみなしてスキップする。
    """
    ingredients = []
    for slot in range(INGREDIENT_SLOT_COUNT):
        name_col = FIRST_INGREDIENT_COLUMN + slot * 2
        weight_col = name_col + 1
        name = row[name_col].strip() if name_col < len(row) else ""
        weight_raw = row[weight_col].strip() if weight_col < len(row) else ""
        if name == "" or weight_raw == "":
            continue
        ingredients.append((name, float(weight_raw)))
    return ingredients


def ingredient_weight_total(ingredients):
    """材料の重量(g)を合計する。"""
    return sum(weight for _, weight in ingredients)


def calc_per100g(per_serving, weight_total):
    """1人前あたりの栄養値を、材料重量の合計で割って可食部100gあたりに換算する。

    元データは「ごはん(中茶碗1杯)」のように1人前あたりの値のため、既存アプリの
    「per100gの値 × 入力g数」というデータモデルに合わせるための逆算。
    weight_total が 0 の行は換算できないため None を返す(実データには存在しないが、
    将来のデータ更新に備えた防御)。
    """
    if weight_total == 0:
        return None
    return {
        key: round(float(per_serving[key]) / weight_total * 100, 1)
        for key in NUTRIENT_KEYS
    }


def number_categories(category_sequence):
    """カテゴリ名の並び(重複あり)から、初出順に1始まりの番号を割り当てる。

    久留米市データには文科省成分表のような公式の分類番号がないため、
    CSV内での初出順をそのまま採番に使う。
    """
    numbers = {}
    next_number = 1
    for category in category_sequence:
        if category not in numbers:
            numbers[category] = next_number
            next_number += 1
    return numbers
