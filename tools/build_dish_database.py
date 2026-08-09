"""久留米市「料理の栄養価一覧」をアプリ用JSONとMarkdownに変換する。

出典: 久留米市「料理の栄養価一覧」(久留米市保健所健康推進課、CC BY)
https://data.bodik.jp/dataset/402036_0009100_00005
"""

import csv
import io
import json
import sys
import urllib.request
from datetime import date
from pathlib import Path

SOURCE_URL = (
    "https://data.bodik.jp/dataset/12425147-84ca-427e-b46f-8c3229536365/"
    "resource/adf887ae-101b-42ee-9a37-97fcdd25a620/download/40203691000000500001.csv"
)
SOURCE_LABEL = "久留米市「料理の栄養価一覧」(CC BY)"

REPO_ROOT = Path(__file__).resolve().parent.parent
CACHE_PATH = REPO_ROOT / "tools" / "cache" / "kurume_dishes.csv"
JSON_PATH = REPO_ROOT / "data" / "kurume-dishes.json"
MARKDOWN_DIR = REPO_ROOT / "docs" / "料理"

NUTRIENT_COLUMNS = {"kcal": 2, "protein": 3, "fat": 4, "carb": 5, "salt": 6}
VEGETABLE_COLUMN = 7

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


def download_source_if_needed():
    """入力CSVがローカルに無ければ久留米市の公開サイトから取得する。"""
    if CACHE_PATH.exists():
        return CACHE_PATH
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    print(f"料理データをダウンロードしています: {SOURCE_URL}")
    urllib.request.urlretrieve(SOURCE_URL, CACHE_PATH)
    return CACHE_PATH


def read_dishes(csv_path):
    """CSVを読み、料理レコードのリストを返す。"""
    with io.open(csv_path, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        rows = list(reader)
    data_rows = [row for row in rows[1:] if len(row) > 1 and row[1].strip()]

    category_numbers = number_categories([row[0].strip() for row in data_rows])

    dishes = []
    skipped = 0
    for index, row in enumerate(data_rows, start=1):
        category = row[0].strip()
        name = row[1].strip()
        per_serving = {key: row[col].strip() for key, col in NUTRIENT_COLUMNS.items()}
        ingredients = parse_ingredients(row)
        weight_total = ingredient_weight_total(ingredients)
        per100g = calc_per100g(per_serving, weight_total)
        if per100g is None:
            skipped += 1
            continue
        dishes.append(
            {
                "code": f"K{index:03d}",
                "group": category,
                "group_number": category_numbers[category],
                "name": name,
                "per100g": per100g,
                # Markdown出力でのみ使う。JSONには含めない。
                "_per_serving": per_serving,
                "_vegetable_g": row[VEGETABLE_COLUMN].strip(),
                "_ingredients": ingredients,
                "_weight_total": weight_total,
            }
        )
    if skipped:
        print(f"警告: 材料重量の合計が0の行を{skipped}件スキップしました", file=sys.stderr)
    return dishes


def write_json(dishes):
    """アプリが読むJSONを書き出す(内部用の _ 始まりのキーは除く)。"""
    payload = [
        {"code": d["code"], "group": d["group"], "name": d["name"], "per100g": d["per100g"]}
        for d in dishes
    ]
    JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    with JSON_PATH.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print(f"書き出しました: {JSON_PATH} ({len(payload)}品目)")


def write_markdown(dishes):
    """料理の種類ごとにObsidianで読めるMarkdownを書き出す。"""
    MARKDOWN_DIR.mkdir(parents=True, exist_ok=True)
    by_group = {}
    for d in dishes:
        by_group.setdefault(d["group"], []).append(d)

    generated_on = date.today().isoformat()
    for group, items in by_group.items():
        number = items[0]["group_number"]
        lines = [
            f"# {group}",
            "",
            f"出典: {SOURCE_LABEL}",
            f"生成日: {generated_on} / 品目数: {len(items)}",
            "",
            "栄養価は文部科学省「日本食品標準成分表2010年版」を基に久留米市が算出したものです。",
            "「1人前あたり」の値を、材料重量の合計で割って可食部100gあたりに換算しています。",
            "",
        ]
        for d in items:
            s = d["_per_serving"]
            n = d["per100g"]
            ingredient_text = " / ".join(
                f"{name} {weight:g}g" for name, weight in d["_ingredients"]
            )
            lines.append(f"## {d['name']}")
            lines.append("")
            lines.append(
                f"- 1人前(材料重量合計{d['_weight_total']:g}g): "
                f"{s['kcal']}kcal / たんぱく質{s['protein']}g / 脂質{s['fat']}g / "
                f"炭水化物{s['carb']}g / 食塩相当量{s['salt']}g / 野菜量{d['_vegetable_g']}g"
            )
            lines.append(
                f"- 可食部100gあたり: {n['kcal']}kcal / たんぱく質{n['protein']}g / "
                f"脂質{n['fat']}g / 炭水化物{n['carb']}g / 食塩相当量{n['salt']}g"
            )
            lines.append("")
            lines.append(f"材料: {ingredient_text}")
            lines.append("")

        path = MARKDOWN_DIR / f"{number:02d}_{group}.md"
        path.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(f"書き出しました: {MARKDOWN_DIR} ({len(by_group)}ファイル)")


def verify(dishes):
    """生成結果を検証し、異常があれば標準エラーに警告を出す。"""
    warnings = []
    total = len(dishes)
    if total < 250:
        warnings.append(f"品目数が想定より少ないです: {total}件(期待: 250件以上)")

    too_large = [d for d in dishes if d["per100g"]["kcal"] > 1000]
    if too_large:
        warnings.append(
            f"per100gのkcalが1000を超える品目があります: {len(too_large)}件"
            f"(例: {too_large[0]['name']} {too_large[0]['per100g']['kcal']})"
        )

    negative = [d for d in dishes if d["per100g"]["kcal"] < 0]
    if negative:
        warnings.append(f"per100gのkcalが負の品目があります: {len(negative)}件")

    print(f"検証: {total}品目")
    for warning in warnings:
        print(f"警告: {warning}", file=sys.stderr)
    return not warnings


def main():
    csv_path = download_source_if_needed()
    dishes = read_dishes(csv_path)
    write_json(dishes)
    write_markdown(dishes)
    verify(dishes)


if __name__ == "__main__":
    main()
