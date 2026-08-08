"""日本食品標準成分表(八訂)増補2023年をアプリ用JSONとMarkdownに変換する。

出典: 文部科学省 日本食品標準成分表(八訂)増補2023年 第2章(データ)
https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html
"""

import re

NUMBER_PATTERN = re.compile(r"-?\d+(?:\.\d+)?")
SHEET_PREFIX_PATTERN = re.compile(r"^\d+")


def parse_value(raw):
    """成分表のセル値を数値化する。

    成分表の数値欄には測定状況を示す記号が混在する:
      Tr / (Tr) 微量、- 未測定、(9.7) 推計値、14.0† 注記付き。
    いずれも計算を止めずに進めるため 0 か数値へ落とす。
    """
    if raw is None:
        return 0.0
    if isinstance(raw, (int, float)):
        return float(raw)

    text = str(raw).strip()
    if text == "":
        return 0.0
    if "Tr" in text:
        return 0.0

    match = NUMBER_PATTERN.search(text)
    if match is None:
        return 0.0
    return float(match.group())


def _is_not_measured(raw):
    if raw is None:
        return True
    if isinstance(raw, (int, float)):
        return False
    return str(raw).strip() in ("", "-")


def calc_sugar(carb_raw, fiber_raw):
    """糖質を「炭水化物 − 食物繊維総量」で算出する。

    食物繊維が未測定の品目では減算せず炭水化物をそのまま採用する。
    食物繊維が炭水化物を上回る品目(こんにゃく等)は 0 にクランプする。
    """
    carb = parse_value(carb_raw)
    if _is_not_measured(fiber_raw):
        return round(carb, 1)
    sugar = carb - parse_value(fiber_raw)
    return round(max(sugar, 0.0), 1)


def normalize_name(raw):
    """食品名の全角スペースを半角に直し、連続する空白を1つにまとめる。"""
    text = str(raw).replace("　", " ")
    return re.sub(r"\s+", " ", text).strip()


def group_name_from_sheet(sheet_name):
    """シート名(例 '1穀類')の先頭の食品群番号を除いて群名を返す。"""
    return SHEET_PREFIX_PATTERN.sub("", sheet_name).strip()
