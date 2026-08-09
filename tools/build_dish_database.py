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

# 期待するCSVヘッダー(先頭7列)。列の並びが変わった場合に誤った栄養値を
# 書き込んでしまわないよう、read_dishesで実際のヘッダーと突き合わせる。
EXPECTED_HEADER_PREFIXES = (
    "料理の種類",
    "料理名",
    "エネルギー",
    "たんぱく質",
    "脂質",
    "炭水化物",
    "食塩相当量",
)

# 「1人前の値 ÷ 材料重量合計」という換算は、材料重量の合計が出来上がりの
# 料理の重量とほぼ等しいという前提で成り立つ。この前提が崩れる代表的な
# 2パターンを検出する。
#
# 1. 米・麺類を炊く/茹でる前の乾物・生の状態のまま材料欄に記載している料理。
#    水を吸って重量が増えるため、材料重量の合計が出来上がりより軽くなり、
#    per100gが過大評価される。CSV全286行を確認し、実際にこの状態で
#    per100gが破綻していたのは以下の材料名を使う行のみだった
#    (「めし・精白米」のように調理後を表す名前は対象外)。
RAW_STAPLE_INGREDIENTS = (
    "米・精白米（水稲）",
    "大麦・押麦",
    "マカロニ・スパゲッティ＿乾",
    "中華めん＿生",
)
# 乾物・生材料の影響でper100g kcalがこの値を超えたら「実態と大きくずれている」
# とみなす(調味料カテゴリは1回分の使用量が少なく高kcal/100gが正常なため対象外)。
RAW_STAPLE_KCAL_THRESHOLD = 300

# 2. 汁物カテゴリなのに、だし・牛乳など「水分」にあたる材料が記載されておらず、
#    具材と調味料の重量だけで割ってしまっている料理。塩分などが実際の数倍に
#    跳ね上がる。「だし」「つゆ」「牛乳」を含む材料名が1つも無ければ該当。
#    (「固形コンソメ」は溶かす水が別途必要なため、それ単体は水分とみなさない)
SOUP_GROUP_MARKER = "汁物"
LIQUID_INGREDIENT_MARKERS = ("だし", "つゆ", "牛乳")


def is_unreliable_conversion(group, ingredients, per100g):
    """per100gへの逆算が実態と大きくずれている疑いがあるかを判定する。

    group: 料理の種類(カテゴリ名)
    ingredients: [(材料名, 重量g), ...]
    per100g: calc_per100gの戻り値({"kcal": ..., ...})。Noneの場合はFalseを返す。
    """
    if per100g is None:
        return False

    names = [name for name, _weight in ingredients]

    if group != "調味料" and per100g["kcal"] > RAW_STAPLE_KCAL_THRESHOLD:
        if any(marker in name for name in names for marker in RAW_STAPLE_INGREDIENTS):
            return True

    if SOUP_GROUP_MARKER in group:
        has_liquid = any(
            marker in name for name in names for marker in LIQUID_INGREDIENT_MARKERS
        )
        if not has_liquid:
            return True

    return False


def parse_ingredients(row):
    """CSVの1行から、材料名と重量(g)のペアのリストを返す。

    材料欄は最大20スロット(材料名・重量のペア)あるが、使われていないスロットは
    両方とも空文字になっている。名前か重量のどちらかが空なら、そのスロットは
    使われていないとみなしてスキップする。

    重量欄に「少々」「適量」のような数値に変換できない文字列が入っている場合は
    ValueErrorを送出する(呼び出し側でその行をスキップする想定)。
    """
    ingredients = []
    for slot in range(INGREDIENT_SLOT_COUNT):
        name_col = FIRST_INGREDIENT_COLUMN + slot * 2
        weight_col = name_col + 1
        name = row[name_col].strip() if name_col < len(row) else ""
        weight_raw = row[weight_col].strip() if weight_col < len(row) else ""
        if name == "" or weight_raw == "":
            continue
        try:
            weight = float(weight_raw)
        except ValueError as exc:
            raise ValueError(
                f"材料「{name}」の重量が数値ではありません: {weight_raw!r}"
            ) from exc
        ingredients.append((name, weight))
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

    per_servingの値が「少々」「適量」のような数値に変換できない文字列の場合は
    ValueErrorを送出する(呼び出し側でその行をスキップする想定)。
    """
    if weight_total == 0:
        return None
    result = {}
    for key in NUTRIENT_KEYS:
        raw = per_serving[key]
        try:
            value = float(raw)
        except ValueError as exc:
            raise ValueError(
                f"栄養値「{key}」が数値ではありません: {raw!r}"
            ) from exc
        result[key] = round(value / weight_total * 100, 1)
    return result


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


def validate_header(header_row):
    """CSVの1行目が期待するヘッダーかを検証する。

    列順が変わったり列が増減したりしていると、以降の列番号決め打ちの処理が
    気づかないまま誤った栄養値を書き込んでしまうため、事前に食い止める。
    """
    for index, expected_prefix in enumerate(EXPECTED_HEADER_PREFIXES):
        actual = header_row[index].strip() if index < len(header_row) else ""
        if not actual.startswith(expected_prefix):
            raise ValueError(
                "CSVのヘッダーが想定と異なります。列の並びが変わっていないか確認してください。"
                f" (列{index + 1}: 期待='{expected_prefix}...' 実際='{actual}')"
            )


def read_dishes(csv_path):
    """CSVを読み、料理レコードのリストを返す。"""
    with io.open(csv_path, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        rows = list(reader)
    validate_header(rows[0])
    data_rows = [row for row in rows[1:] if len(row) > 1 and row[1].strip()]

    category_numbers = number_categories([row[0].strip() for row in data_rows])

    dishes = []
    skipped_zero_weight = 0
    skipped_non_numeric = 0
    skipped_unreliable = 0
    for index, row in enumerate(data_rows, start=1):
        category = row[0].strip()
        name = row[1].strip()
        per_serving = {key: row[col].strip() for key, col in NUTRIENT_COLUMNS.items()}
        try:
            ingredients = parse_ingredients(row)
        except ValueError as exc:
            skipped_non_numeric += 1
            print(f"警告: 「{name}」の材料重量が数値ではないためスキップしました: {exc}", file=sys.stderr)
            continue
        weight_total = ingredient_weight_total(ingredients)
        if weight_total == 0:
            skipped_zero_weight += 1
            continue
        try:
            per100g = calc_per100g(per_serving, weight_total)
        except ValueError as exc:
            skipped_non_numeric += 1
            print(f"警告: 「{name}」の栄養値が数値ではないためスキップしました: {exc}", file=sys.stderr)
            continue
        if per100g is None:
            skipped_zero_weight += 1
            continue
        if is_unreliable_conversion(category, ingredients, per100g):
            skipped_unreliable += 1
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
    if skipped_zero_weight:
        print(f"警告: 材料重量の合計が0の行を{skipped_zero_weight}件スキップしました", file=sys.stderr)
    if skipped_non_numeric:
        print(f"警告: 数値に変換できない値を含む行を{skipped_non_numeric}件スキップしました", file=sys.stderr)
    if skipped_unreliable:
        print(
            f"警告: per100gへの換算が実態と大きくずれる疑いのある行を{skipped_unreliable}件除外しました",
            file=sys.stderr,
        )
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
