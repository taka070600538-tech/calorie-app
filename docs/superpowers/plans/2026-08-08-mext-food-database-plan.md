# 日本食品標準成分表の取り込みと食品登録フロー刷新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 文部科学省「日本食品標準成分表(八訂)増補2023年」の全2,538品目をアプリ用JSONとObsidian閲覧用Markdownに変換し、食品一覧を白紙から始めて成分表を検索して選んだ品目だけを登録できるようにする。

**Architecture:** Pythonの変換スクリプト(`tools/build_food_database.py`)が公式xlsxから `data/mext-foods.json` と `docs/成分表/*.md` を生成する。アプリ側は新規モジュール `js/mextTable.js` が成分表JSONを遅延読み込みして検索を提供し、`js/foodForm.js` の食品管理画面に「成分表から探す」セクションを追加する。既存のシード投入は廃止し、IndexedDBのバージョンを上げて旧シード食品を自動削除する。

**Tech Stack:** Python 3 + openpyxl(変換スクリプトのみ)、素のJavaScript(ESモジュール)、素のCSS、IndexedDB。アプリ側に外部ライブラリは追加しない。

## Global Constraints

- ビルド不要の静的PWA構成を維持する(バンドラ・フレームワーク導入禁止)。
- アプリ実行時のネットワーク通信は追加しない。成分表JSONは同梱ファイルを `fetch` するのみで、外部ホストへのアクセスは行わない。
- 既存の `escapeHtml` によるXSS対策パターンを崩さない。食品名など動的文字列をHTMLに埋め込む箇所は必ず `escapeHtml` を通す。
- 栄養素の内部フィールド名は既存の `kcal` / `protein` / `fat` / `carb` / `salt` を使う。`carb` には糖質(炭水化物 − 食物繊維総量)を入れる。
- 表示上の栄養素名は「タンパク質」「脂質」「糖質」「塩分」を使う(P/F/C略記は使わない)。
- 変換スクリプトの入力xlsxはリポジトリに含めない(`tools/cache/` を `.gitignore` する)。
- 成分表の値のパース規則は以下の順序で適用する(設計書で確定済み):
  1. `None` または空文字 → `0`
  2. 数値型 → そのまま
  3. 文字列に `Tr` を含む → `0`
  4. 正規表現 `-?\d+(\.\d+)?` で最初に見つかった数値 → その値
  5. 数値が見つからない → `0`

---

### Task 1: 変換スクリプトの純粋関数をTDDで実装する

xlsxの読み込みを伴わない純粋関数(値パース・糖質算出・食品名正規化・食品群名抽出)を先にテスト付きで作る。この時点ではまだファイル出力は行わない。

**Files:**
- Create: `tools/build_food_database.py`
- Create: `tools/test_build_food_database.py`
- Create: `.gitignore`

**Interfaces:**
- Consumes: なし(このタスクが起点)
- Produces:
  - `parse_value(raw) -> float` — 成分表のセル値を数値化する
  - `calc_sugar(carb_raw, fiber_raw) -> float` — 炭水化物と食物繊維の生値から糖質を算出する
  - `normalize_name(raw) -> str` — 食品名の空白を正規化する
  - `group_name_from_sheet(sheet_name) -> str` — シート名から食品群名を取り出す

- [ ] **Step 1: `.gitignore` を作成する**

リポジトリ直下に `.gitignore` を新規作成し、以下の内容を書く。

```gitignore
tools/cache/
__pycache__/
```

- [ ] **Step 2: 失敗するテストを書く**

`tools/test_build_food_database.py` を新規作成し、以下を書く。

```python
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
```

- [ ] **Step 3: テストを実行して失敗を確認する**

```bash
cd tools && python -m unittest test_build_food_database -v
```

期待する結果: `ModuleNotFoundError: No module named 'build_food_database'` で失敗する。

- [ ] **Step 4: 純粋関数を実装する**

`tools/build_food_database.py` を新規作成し、以下を書く。

```python
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
```

- [ ] **Step 5: テストを実行して成功を確認する**

```bash
cd tools && python -m unittest test_build_food_database -v
```

期待する結果: 27件すべて PASS。

`calc_sugar` が最後に `round(..., 1)` を通すのは、`64.9 - 7.4` が浮動小数点では
`57.50000000000001` になるためである。この丸めがないとJSONに誤差が残った値が出力される。

- [ ] **Step 6: コミットする**

```bash
git add .gitignore tools/build_food_database.py tools/test_build_food_database.py
git commit -m "feat: 成分表変換スクリプトの値パース・糖質算出をTDDで実装"
```

---

### Task 2: xlsxを読み込んでJSONとMarkdownを出力する

Task 1の純粋関数を使い、xlsxのダウンロード・読み込み・出力・検証を実装してスクリプトを完成させ、実際に生成物をコミットする。

**Files:**
- Modify: `tools/build_food_database.py`(Task 1で作成したファイルに追記)
- Create: `data/mext-foods.json`(スクリプトの生成物)
- Create: `docs/成分表/01_穀類.md` 〜 `docs/成分表/18_調理済み流通食品類.md`(スクリプトの生成物、18ファイル)

**Interfaces:**
- Consumes: Task 1の `parse_value(raw)`, `calc_sugar(carb_raw, fiber_raw)`, `normalize_name(raw)`, `group_name_from_sheet(sheet_name)`
- Produces:
  - `data/mext-foods.json` — 配列。各要素は `{"code": "01088", "group": "穀類", "name": "こめ ［水稲めし］ 精白米 うるち米", "per100g": {"kcal": 156, "protein": 2.5, "fat": 0.3, "carb": 35.6, "salt": 0}}`。この形式を Task 4 の `js/mextTable.js` が読む。

- [ ] **Step 1: openpyxl が利用できることを確認する**

```bash
python -c "import openpyxl; print(openpyxl.__version__)"
```

期待する結果: バージョン番号が表示される(例 `3.1.5`)。`ModuleNotFoundError` が出た場合のみ `pip install openpyxl` を実行する。

- [ ] **Step 2: `tools/build_food_database.py` に読み込み・出力処理を追記する**

Task 1で書いた `import re` の行を以下に差し替える。

```python
import json
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path

import openpyxl
```

続いて、既存の `NUMBER_PATTERN` / `SHEET_PREFIX_PATTERN` の定義の直後に以下の定数を追加する。

```python
SOURCE_URL = (
    "https://www.mext.go.jp/content/20260327-mxt_kagsei-mext-000029402_02.xlsx"
)
SOURCE_LABEL = "日本食品標準成分表(八訂)増補2023年(文部科学省)"

REPO_ROOT = Path(__file__).resolve().parent.parent
CACHE_PATH = REPO_ROOT / "tools" / "cache" / "mext_seibun.xlsx"
JSON_PATH = REPO_ROOT / "data" / "mext-foods.json"
MARKDOWN_DIR = REPO_ROOT / "docs" / "成分表"

MAIN_SHEET = "表全体"
IDENTIFIER_ROW = 12  # 成分識別子(ENERC_KCAL 等)が並ぶ行(1始まり)
FIRST_DATA_ROW = 13
COL_GROUP_CODE = 0
COL_FOOD_CODE = 1
COL_FOOD_NAME = 3

# 使用する成分識別子。列位置は固定せずこの識別子から解決する。
IDENTIFIERS = {
    "kcal": "ENERC_KCAL",
    "protein": "PROT-",
    "fat": "FAT-",
    "fiber": "FIB-",
    "carb": "CHOCDF-",
    "salt": "NACL_EQ",
}
```

ファイル末尾(`group_name_from_sheet` の定義の後)に以下を追記する。

```python
def download_source_if_needed():
    """入力xlsxがローカルに無ければ文科省サイトから取得する。"""
    if CACHE_PATH.exists():
        return CACHE_PATH
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    print(f"成分表をダウンロードしています: {SOURCE_URL}")
    urllib.request.urlretrieve(SOURCE_URL, CACHE_PATH)
    return CACHE_PATH


def resolve_columns(identifier_row):
    """成分識別子の行から、必要な成分の列インデックスを解決する。

    文科省が列を追加・並び替えても壊れないよう、列位置は固定値にしない。
    """
    cells = [str(c).strip() if c is not None else "" for c in identifier_row]
    columns = {}
    for key, identifier in IDENTIFIERS.items():
        if identifier not in cells:
            raise SystemExit(
                f"成分識別子 '{identifier}' が{IDENTIFIER_ROW}行目に見つかりません。"
                "成分表の書式が変更された可能性があります。"
            )
        columns[key] = cells.index(identifier)
    return columns


def load_group_names(workbook):
    """シート名から食品群コードと群名の対応表を作る('1穀類' -> {'01': '穀類'})。"""
    groups = {}
    for sheet_name in workbook.sheetnames:
        if sheet_name == MAIN_SHEET:
            continue
        match = SHEET_PREFIX_PATTERN.match(sheet_name)
        if match is None:
            continue
        code = match.group().zfill(2)
        groups[code] = group_name_from_sheet(sheet_name)
    return groups


def read_foods(xlsx_path):
    """xlsxを読み、食品レコードのリストを返す。"""
    workbook = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    group_names = load_group_names(workbook)
    sheet = workbook[MAIN_SHEET]
    rows = list(sheet.iter_rows(values_only=True))
    columns = resolve_columns(rows[IDENTIFIER_ROW - 1])

    foods = []
    for row in rows[FIRST_DATA_ROW - 1:]:
        code = row[COL_FOOD_CODE]
        if code in (None, ""):
            continue
        group_code = str(row[COL_GROUP_CODE]).zfill(2)
        carb_raw = row[columns["carb"]]
        fiber_raw = row[columns["fiber"]]
        foods.append(
            {
                "code": str(code),
                "group": group_names.get(group_code, group_code),
                "name": normalize_name(row[COL_FOOD_NAME]),
                "per100g": {
                    "kcal": round(parse_value(row[columns["kcal"]]), 1),
                    "protein": round(parse_value(row[columns["protein"]]), 1),
                    "fat": round(parse_value(row[columns["fat"]]), 1),
                    "carb": calc_sugar(carb_raw, fiber_raw),
                    "salt": round(parse_value(row[columns["salt"]]), 1),
                },
                # Markdown出力でのみ使う。JSONには含めない。
                "_fiber": round(parse_value(fiber_raw), 1),
                "_carbohydrate": round(parse_value(carb_raw), 1),
                "_group_code": group_code,
            }
        )
    return foods


def write_json(foods):
    """アプリが読むJSONを書き出す(内部用の _ 始まりのキーは除く)。"""
    payload = [
        {
            "code": food["code"],
            "group": food["group"],
            "name": food["name"],
            "per100g": food["per100g"],
        }
        for food in foods
    ]
    JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    with JSON_PATH.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print(f"書き出しました: {JSON_PATH} ({len(payload)}品目)")


def write_markdown(foods):
    """食品群ごとにObsidianで読めるMarkdownの表を書き出す。"""
    MARKDOWN_DIR.mkdir(parents=True, exist_ok=True)
    by_group = {}
    for food in foods:
        by_group.setdefault(food["_group_code"], []).append(food)

    generated_on = date.today().isoformat()
    for group_code in sorted(by_group):
        items = by_group[group_code]
        group_name = items[0]["group"]
        lines = [
            f"# {int(group_code)} {group_name}",
            "",
            f"出典: {SOURCE_LABEL}",
            f"生成日: {generated_on} / 品目数: {len(items)}",
            "",
            "すべて可食部100gあたりの値。糖質は「炭水化物 − 食物繊維総量」で算出。",
            "",
            "| 食品番号 | 食品名 | kcal | タンパク質 | 脂質 | 糖質 | 食物繊維 | 炭水化物 | 塩分 |",
            "|---|---|---|---|---|---|---|---|---|",
        ]
        for food in items:
            n = food["per100g"]
            lines.append(
                f"| {food['code']} | {food['name']} | {n['kcal']:g} | {n['protein']:g} | "
                f"{n['fat']:g} | {n['carb']:g} | {food['_fiber']:g} | "
                f"{food['_carbohydrate']:g} | {n['salt']:g} |"
            )
        lines.append("")

        path = MARKDOWN_DIR / f"{group_code}_{group_name}.md"
        path.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(f"書き出しました: {MARKDOWN_DIR} ({len(by_group)}ファイル)")


def verify(foods):
    """生成結果を検証し、異常があれば標準エラーに警告を出す。"""
    warnings = []
    total = len(foods)
    if total < 2000:
        warnings.append(f"品目数が想定より少ないです: {total}件(期待: 2000件以上)")

    zero_kcal = sum(1 for f in foods if f["per100g"]["kcal"] == 0)
    if total and zero_kcal / total > 0.10:
        warnings.append(
            f"kcalが0の品目が多すぎます: {zero_kcal}件({zero_kcal / total:.1%})"
        )

    too_large = [f for f in foods if f["per100g"]["kcal"] > 1000]
    if too_large:
        warnings.append(
            f"kcalが1000を超える品目があります: {len(too_large)}件"
            f"(例: {too_large[0]['name']} {too_large[0]['per100g']['kcal']})"
        )

    clamped = sum(
        1 for f in foods if f["per100g"]["carb"] == 0 and f["_carbohydrate"] < f["_fiber"]
    )
    if clamped > 100:
        warnings.append(f"糖質が負になりクランプされた品目が多すぎます: {clamped}件")

    print(f"検証: {total}品目 / kcal=0が{zero_kcal}件 / 糖質クランプが{clamped}件")
    for warning in warnings:
        print(f"警告: {warning}", file=sys.stderr)
    return not warnings


def main():
    xlsx_path = download_source_if_needed()
    foods = read_foods(xlsx_path)
    write_json(foods)
    write_markdown(foods)
    verify(foods)


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: スクリプトを実行して生成物を作る**

```bash
python tools/build_food_database.py
```

期待する出力:

```
書き出しました: .../data/mext-foods.json (2538品目)
書き出しました: .../docs/成分表 (18ファイル)
検証: 2538品目 / kcal=0が12件 / 糖質クランプが19件
```

警告が標準エラーに出ないこと。`成分表をダウンロードしています` の行は初回のみ表示される。

- [ ] **Step 4: 生成物を目視で検証する**

以下を実行し、白米(めし)のレコードが設計どおりの値になっていることを確認する。

```bash
python -c "import json,io; d=json.load(io.open('data/mext-foods.json',encoding='utf-8')); print(len(d)); print([x for x in d if x['code']=='01088'])"
```

期待する結果: 件数が `2538`、白米のレコードが
`{'code': '01088', 'group': '穀類', 'name': 'こめ ［水稲めし］ 精白米 うるち米', 'per100g': {'kcal': 156, 'protein': 2.5, 'fat': 0.3, 'carb': 35.6, 'salt': 0}}`
と一致すること(`kcal` などは `156.0` のように末尾が `.0` で表示される場合があるが、値が一致していればよい)。

続いて、生成されたMarkdownの1つを確認する。

```bash
ls docs/成分表/ && head -12 "docs/成分表/01_穀類.md"
```

期待する結果: 18ファイルが存在し、`01_穀類.md` の見出しが `# 1 穀類`、品目数が `208`、表の1行目が `| 01001 | アマランサス 玄穀 | 343 | 12.7 | 6 | 57.5 | 7.4 | 64.9 | 0 |` であること。

- [ ] **Step 5: コミットする**

```bash
git add tools/build_food_database.py data/mext-foods.json "docs/成分表"
git commit -m "feat: 成分表xlsxからJSONとMarkdownを生成し全2538品目を取り込む"
```

---

### Task 3: 食品一覧を白紙にするマイグレーションを実装する

初回起動時のシード投入をやめ、IndexedDBのバージョンを上げて既存のシード食品を自動削除する。

**Files:**
- Modify: `js/db.js:1-2`(バージョン定数)、`js/db.js:4-25`(`openDB`)、`js/db.js:34-46`(`seedFoodsIfEmpty` を削除)
- Modify: `js/app.js:1`(import文)、`js/app.js:174-183`(初期化処理)
- Delete: `data/foods.json`

**Interfaces:**
- Consumes: なし
- Produces: `openDB(): Promise<IDBDatabase>` — シグネチャは変更なし。バージョン2で開き、旧バージョンからの更新時に `source === 'mext'` の食品を削除する。`seedFoodsIfEmpty` は存在しなくなる。

- [ ] **Step 1: `js/db.js` のバージョンとマイグレーションを書き換える**

`js/db.js` の1行目から25行目(`DB_VERSION` の定義から `openDB` の終わりまで)を以下に置き換える。

```js
const DB_NAME = 'calorie-app-db';
const DB_VERSION = 2;

export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('foods')) {
        db.createObjectStore('foods', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meals')) {
        const mealsStore = db.createObjectStore('meals', { keyPath: 'id', autoIncrement: true });
        mealsStore.createIndex('by_date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains('goals')) {
        db.createObjectStore('goals', { keyPath: 'id' });
      }

      // v1で同梱していたシード食品(source: 'mext')を削除し、食品一覧を白紙に戻す。
      // v2以降に成分表から登録する食品は source: 'custom' なので巻き添えにならない。
      if (event.oldVersion >= 1 && event.oldVersion < 2) {
        const store = event.target.transaction.objectStore('foods');
        const cursorRequest = store.openCursor();
        cursorRequest.onsuccess = (cursorEvent) => {
          const cursor = cursorEvent.target.result;
          if (!cursor) return;
          if (cursor.value.source === 'mext') {
            cursor.delete();
          }
          cursor.continue();
        };
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}
```

- [ ] **Step 2: `js/db.js` から `seedFoodsIfEmpty` を削除する**

`js/db.js` の以下の関数全体を削除する(`promisifyRequest` の定義と `getAllFoods` の定義の間にある)。

```js
export async function seedFoodsIfEmpty(db, seedFoods) {
  const existing = await getAllFoods(db);
  if (existing.length > 0) return;
  const tx = db.transaction('foods', 'readwrite');
  const store = tx.objectStore('foods');
  for (const food of seedFoods) {
    store.put(food);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
```

- [ ] **Step 3: `js/app.js` の初期化処理を書き換える**

1行目のimport文を以下に置き換える(`seedFoodsIfEmpty` を除く)。

```js
import { openDB, getAllFoods, getMealsByDate, getGoals, deleteMeal, addMeal } from './db.js';
```

`init` 関数内の以下のブロックを:

```js
  try {
    const seedResponse = await fetch('data/foods.json');
    const seedFoods = await seedResponse.json();
    await seedFoodsIfEmpty(state.db, seedFoods);
    state.foods = await getAllFoods(state.db);
    state.goals = await getGoals(state.db);
  } catch (err) {
    showStartupErrorBanner('食品データの読み込みに失敗しました。');
    return;
  }
```

以下に置き換える。

```js
  try {
    state.foods = await getAllFoods(state.db);
    state.goals = await getGoals(state.db);
  } catch (err) {
    showStartupErrorBanner('食品データの読み込みに失敗しました。');
    return;
  }
```

- [ ] **Step 4: `data/foods.json` を削除する**

```bash
git rm data/foods.json
```

- [ ] **Step 5: ブラウザで動作確認する**

ローカルサーバーを起動する(Service Workerの古いキャッシュを避けるため、前回と違うポート番号を使う)。

```bash
python -m http.server 8801
```

`http://localhost:8801/` を実ブラウザで開き、以下を確認する。

- 起動時にエラーバナーが出ないこと
- devtoolsコンソールにエラーが出ていないこと
- 下部ナビの「食品」を開くと、登録済みの食品一覧が空になっていること(以前の60品目が消えていること)
- devtoolsの Application → IndexedDB → calorie-app-db のバージョンが 2 になっていること
- 既存の食事記録がある日付を開くと、品目名が「(削除済み食品)」と表示され、カロリー等の数値と進捗バーは以前と同じ値であること
- 食品管理画面の手入力フォームから食品を1件登録でき、一覧に表示されること

- [ ] **Step 6: コミットする**

```bash
git add js/db.js js/app.js data/foods.json
git commit -m "feat: 同梱食品のシード投入を廃止し食品一覧を白紙から始める"
```

---

### Task 4: 成分表の読み込みと検索モジュールをTDDで実装する

成分表JSONを遅延読み込みし、食品名で検索するモジュールを作る。UIへの接続は Task 5 で行う。

**Files:**
- Create: `js/mextTable.js`
- Create: `tests/mextTable.test.js`

**Interfaces:**
- Consumes: `data/mext-foods.json`(Task 2の生成物)
- Produces:
  - `loadMextTable(): Promise<MextFood[]>` — 成分表JSONを取得する。2回目以降はキャッシュを返す。
  - `searchMextFoods(table, query, limit = 50): MextFood[]` — 食品名の部分一致で検索し、前方一致を優先して最大 `limit` 件返す。
  - `MextFood` は `{ code: string, group: string, name: string, per100g: { kcal, protein, fat, carb, salt } }`。

- [ ] **Step 1: 既存テストの書き方を確認する**

```bash
ls tests/ && head -20 tests/foodSearch.test.js
```

既存テストと同じ形式(`node:test` の `test` と `node:assert/strict`)に合わせる。

- [ ] **Step 2: 失敗するテストを書く**

`tests/mextTable.test.js` を新規作成し、以下を書く。

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { searchMextFoods } from '../js/mextTable.js';

const TABLE = [
  { code: '01088', group: '穀類', name: 'こめ ［水稲めし］ 精白米 うるち米', per100g: { kcal: 156, protein: 2.5, fat: 0.3, carb: 35.6, salt: 0 } },
  { code: '01083', group: '穀類', name: 'こめ ［水稲穀粒］ 精白米 うるち米', per100g: { kcal: 342, protein: 6.1, fat: 0.9, carb: 77.1, salt: 0 } },
  { code: '06182', group: '野菜類', name: '（トマト類） 赤色トマト 果実 生', per100g: { kcal: 20, protein: 0.7, fat: 0.1, carb: 3.7, salt: 0 } },
  { code: '11220', group: '肉類', name: '＜畜肉類＞ ぶた ロース 生', per100g: { kcal: 248, protein: 19.3, fat: 19.2, carb: 0.2, salt: 0.1 } },
];

test('空クエリでは空配列を返す', () => {
  assert.deepEqual(searchMextFoods(TABLE, ''), []);
});

test('空白のみのクエリでは空配列を返す', () => {
  assert.deepEqual(searchMextFoods(TABLE, '   '), []);
});

test('食品名の部分一致で検索できる', () => {
  const results = searchMextFoods(TABLE, '精白米');
  assert.equal(results.length, 2);
  assert.equal(results[0].group, '穀類');
});

test('該当がなければ空配列を返す', () => {
  assert.deepEqual(searchMextFoods(TABLE, 'そんな食品はない'), []);
});

test('前方一致する品目を部分一致より先に返す', () => {
  const results = searchMextFoods(TABLE, 'こめ');
  assert.equal(results.length, 2);
  assert.equal(results[0].name.startsWith('こめ'), true);
});

test('前方一致が後方にある品目より優先される', () => {
  const table = [
    { code: 'x1', group: 'a', name: '大根おろし', per100g: {} },
    { code: 'x2', group: 'a', name: 'おろし大根', per100g: {} },
  ];
  const results = searchMextFoods(table, 'おろし');
  assert.equal(results[0].code, 'x2');
});

test('limitで件数を打ち切る', () => {
  const table = Array.from({ length: 100 }, (_, i) => ({
    code: String(i), group: '穀類', name: `テスト食品${i}`, per100g: {},
  }));
  assert.equal(searchMextFoods(table, 'テスト').length, 50);
  assert.equal(searchMextFoods(table, 'テスト', 10).length, 10);
});

test('大文字小文字を区別しない', () => {
  const table = [{ code: 'x', group: 'a', name: 'Cheese ゴーダ', per100g: {} }];
  assert.equal(searchMextFoods(table, 'cheese').length, 1);
});

test('前後の空白を無視して検索する', () => {
  assert.equal(searchMextFoods(TABLE, '  トマト  ').length, 1);
});

test('元の配列を書き換えない', () => {
  const original = [...TABLE];
  searchMextFoods(TABLE, 'こめ');
  assert.deepEqual(TABLE, original);
});
```

- [ ] **Step 3: テストを実行して失敗を確認する**

```bash
node --test tests/mextTable.test.js
```

期待する結果: `Cannot find module` を含むエラーで失敗する。

- [ ] **Step 4: `js/mextTable.js` を実装する**

`js/mextTable.js` を新規作成し、以下を書く。

```js
const TABLE_URL = 'data/mext-foods.json';

// 約300KBのJSONを起動時に読むとダッシュボードの初期表示が遅くなるため、
// 食品管理画面を開いたときに初めて読み込み、以後はメモリ上に保持する。
let cachedTable = null;
let inflightRequest = null;

export async function loadMextTable() {
  if (cachedTable) return cachedTable;
  if (inflightRequest) return inflightRequest;

  inflightRequest = (async () => {
    try {
      const response = await fetch(TABLE_URL);
      if (!response.ok) {
        throw new Error(`成分表の取得に失敗しました (${response.status})`);
      }
      cachedTable = await response.json();
      return cachedTable;
    } finally {
      inflightRequest = null;
    }
  })();

  return inflightRequest;
}

export function searchMextFoods(table, query, limit = 50) {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === '') return [];

  const prefixMatches = [];
  const otherMatches = [];

  for (const food of table) {
    const name = food.name.toLowerCase();
    if (name.startsWith(trimmed)) {
      prefixMatches.push(food);
    } else if (name.includes(trimmed)) {
      otherMatches.push(food);
    }
    if (prefixMatches.length >= limit) break;
  }

  return [...prefixMatches, ...otherMatches].slice(0, limit);
}
```

`loadMextTable` が `inflightRequest` を保持するのは、検索欄に速く入力したときに同じJSONを何度も取得しないようにするためである。

- [ ] **Step 5: テストを実行して成功を確認する**

```bash
node --test tests/mextTable.test.js
```

期待する結果: 10件すべて PASS。

- [ ] **Step 6: 既存テストが壊れていないことを確認する**

```bash
node --test tests/
```

期待する結果: すべて PASS。

- [ ] **Step 7: コミットする**

```bash
git add js/mextTable.js tests/mextTable.test.js
git commit -m "feat: 成分表の遅延読み込みと検索モジュールをTDDで実装"
```

---

### Task 5: 食品管理画面に「成分表から探す」を追加する

Task 4のモジュールを食品管理画面に接続し、成分表の候補を選ぶと登録フォームに値が流し込まれるようにする。

**Files:**
- Modify: `js/foodForm.js`(全面書き換え)
- Modify: `style.css`(末尾に追記)

**Interfaces:**
- Consumes: Task 4の `loadMextTable(): Promise<MextFood[]>` と `searchMextFoods(table, query, limit): MextFood[]`、既存の `js/db.js` の `addFood(db, food): Promise<id>` / `updateFood(db, food): Promise<void>` / `deleteFood(db, id): Promise<void>`、既存の `js/render.js` の `escapeHtml(str): string`
- Produces: `renderFoodsView(container, db, foods, { prefillName, onChange }): void` — シグネチャは変更なし。呼び出し側の `js/app.js` は変更不要。

- [ ] **Step 1: `js/foodForm.js` を書き換える**

`js/foodForm.js` の内容を以下に置き換える。

```js
import { addFood, updateFood, deleteFood } from './db.js';
import { escapeHtml } from './render.js';
import { loadMextTable, searchMextFoods } from './mextTable.js';

export function renderFoodsView(container, db, foods, { prefillName = '', onChange } = {}) {
  container.innerHTML = `
    <h2>成分表から探す</h2>
    <p class="mext-help">日本食品標準成分表(八訂)増補2023年から選ぶと、栄養値が下のフォームに入ります。</p>
    <input type="search" id="mext-query" class="mext-query" placeholder="例: 精白米" autocomplete="off">
    <ul id="mext-results" class="mext-results"></ul>

    <h2>食品の登録・編集</h2>
    <form id="food-form" class="food-form">
      <input type="hidden" id="food-id">
      <input type="hidden" id="food-mext-code">
      <label>食品名 <input type="text" id="food-name" required></label>
      <label>カロリー(kcal/100g) <input type="number" id="food-kcal" step="0.1" min="0" required></label>
      <label>タンパク質(g/100g) <input type="number" id="food-protein" step="0.1" min="0" required></label>
      <label>脂質(g/100g) <input type="number" id="food-fat" step="0.1" min="0" required></label>
      <label>糖質(g/100g) <input type="number" id="food-carb" step="0.1" min="0" required></label>
      <label>塩分(g/100g) <input type="number" id="food-salt" step="0.1" min="0" required></label>
      <div class="food-form-actions">
        <button type="submit">保存</button>
        <button type="button" id="food-form-reset">クリア</button>
      </div>
    </form>

    <h2>登録済みの食品</h2>
    <ul id="food-list" class="food-list"></ul>
  `;

  const form = container.querySelector('#food-form');
  const idInput = container.querySelector('#food-id');
  const mextCodeInput = container.querySelector('#food-mext-code');
  const nameInput = container.querySelector('#food-name');
  const kcalInput = container.querySelector('#food-kcal');
  const proteinInput = container.querySelector('#food-protein');
  const fatInput = container.querySelector('#food-fat');
  const carbInput = container.querySelector('#food-carb');
  const saltInput = container.querySelector('#food-salt');
  const list = container.querySelector('#food-list');
  const resetBtn = container.querySelector('#food-form-reset');
  const mextQuery = container.querySelector('#mext-query');
  const mextResults = container.querySelector('#mext-results');

  let mextTable = null;
  let mextLoadFailed = false;

  function resetForm() {
    form.reset();
    idInput.value = '';
    mextCodeInput.value = '';
  }

  function fillForm(food) {
    idInput.value = food.id;
    mextCodeInput.value = food.mextCode ?? '';
    nameInput.value = food.name;
    kcalInput.value = food.per100g.kcal;
    proteinInput.value = food.per100g.protein;
    fatInput.value = food.per100g.fat;
    carbInput.value = food.per100g.carb;
    saltInput.value = food.per100g.salt;
    nameInput.focus();
  }

  function fillFormFromMext(mextFood) {
    idInput.value = '';
    mextCodeInput.value = mextFood.code;
    nameInput.value = mextFood.name;
    kcalInput.value = mextFood.per100g.kcal;
    proteinInput.value = mextFood.per100g.protein;
    fatInput.value = mextFood.per100g.fat;
    carbInput.value = mextFood.per100g.carb;
    saltInput.value = mextFood.per100g.salt;
    // 正式名称は長いので、すぐ短い名前に打ち替えられるよう全選択しておく。
    nameInput.focus();
    nameInput.select();
  }

  function renderMextMessage(message) {
    mextResults.innerHTML = `<li class="mext-message">${escapeHtml(message)}</li>`;
  }

  function renderMextResults(results) {
    if (results.length === 0) {
      renderMextMessage('該当する品目がありません');
      return;
    }
    mextResults.innerHTML = results
      .map(
        (food) => `
        <li data-mext-code="${escapeHtml(food.code)}">
          <span class="mext-result-name">${escapeHtml(food.name)}</span>
          <span class="mext-result-meta">${escapeHtml(food.group)} / ${food.per100g.kcal}kcal</span>
        </li>`
      )
      .join('');
  }

  async function handleMextQuery() {
    const query = mextQuery.value;
    if (query.trim() === '') {
      mextResults.innerHTML = '';
      return;
    }
    if (mextLoadFailed) {
      renderMextMessage('成分表の読み込みに失敗しました');
      return;
    }
    if (!mextTable) {
      renderMextMessage('成分表を読み込んでいます...');
      try {
        mextTable = await loadMextTable();
      } catch (err) {
        mextLoadFailed = true;
        renderMextMessage('成分表の読み込みに失敗しました');
        return;
      }
      // 読み込み中に入力が変わっている場合があるため、最新の値で検索し直す。
      if (mextQuery.value.trim() === '') {
        mextResults.innerHTML = '';
        return;
      }
    }
    renderMextResults(searchMextFoods(mextTable, mextQuery.value));
  }

  mextQuery.addEventListener('input', handleMextQuery);

  mextResults.addEventListener('click', (event) => {
    const li = event.target.closest('li[data-mext-code]');
    if (!li || !mextTable) return;
    const mextFood = mextTable.find((f) => f.code === li.dataset.mextCode);
    if (!mextFood) return;
    fillFormFromMext(mextFood);
    mextQuery.value = '';
    mextResults.innerHTML = '';
  });

  function renderList() {
    if (foods.length === 0) {
      list.innerHTML = '<li class="food-list-empty">まだ食品が登録されていません。上の検索欄から探して登録してください。</li>';
      return;
    }
    const sorted = [...foods].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    list.innerHTML = sorted
      .map(
        (food) => `
        <li data-food-id="${food.id}">
          <span>${escapeHtml(food.name)}(${food.per100g.kcal}kcal/100g)</span>
          <button type="button" data-action="edit" data-food-id="${food.id}">編集</button>
          <button type="button" data-action="delete" data-food-id="${food.id}">削除</button>
        </li>`
      )
      .join('');
  }

  list.addEventListener('click', async (event) => {
    const btn = event.target.closest('button[data-action]');
    if (!btn) return;
    const foodId = btn.dataset.foodId;
    const food = foods.find((f) => f.id === foodId);
    if (btn.dataset.action === 'edit') {
      fillForm(food);
    } else if (btn.dataset.action === 'delete') {
      if (!confirm(`「${food.name}」を削除しますか？`)) return;
      await deleteFood(db, foodId);
      const index = foods.findIndex((f) => f.id === foodId);
      foods.splice(index, 1);
      renderList();
      onChange?.();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const per100g = {
      kcal: Number(kcalInput.value),
      protein: Number(proteinInput.value),
      fat: Number(fatInput.value),
      carb: Number(carbInput.value),
      salt: Number(saltInput.value),
    };
    const mextCode = mextCodeInput.value || undefined;
    if (idInput.value) {
      const existing = foods.find((f) => f.id === idInput.value);
      const updated = { ...existing, name: nameInput.value, per100g };
      if (mextCode) updated.mextCode = mextCode;
      await updateFood(db, updated);
      Object.assign(existing, updated);
    } else {
      const newFood = { name: nameInput.value, per100g, category: '未分類', source: 'custom' };
      if (mextCode) newFood.mextCode = mextCode;
      const id = await addFood(db, newFood);
      foods.push({ ...newFood, id });
    }
    resetForm();
    renderList();
    onChange?.();
  });

  resetBtn.addEventListener('click', resetForm);

  if (prefillName) {
    nameInput.value = prefillName;
    mextQuery.value = prefillName;
    handleMextQuery();
    nameInput.focus();
  }

  renderList();
}
```

変更の要点:

- 成分表の検索セクションを画面上部に追加した。`loadMextTable()` は最初の検索時にだけ呼ばれる。
- 栄養値の入力欄に `min="0"` を追加し、マイナス値を登録できないようにした(以前のレビューで指摘されていた項目)。
- 登録済み一覧に見出しを付け、0件のときに案内文を出すようにした。
- `mextCode` を隠しフィールドで保持し、保存時に食品レコードへ書き込む。
- 食事記録モーダルから「新しい食品として登録する」で遷移してきた場合(`prefillName`)、その名前で成分表も検索する。

- [ ] **Step 2: `style.css` に追記する**

`style.css` の末尾に以下を追加する。

```css
.mext-help {
  margin: 0 0 var(--spacing-sm) 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.mext-query {
  width: 100%;
  padding: var(--spacing-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: 1rem;
}

.mext-results {
  list-style: none;
  margin: var(--spacing-xs) 0 var(--spacing-md) 0;
  padding: 0;
  max-height: 240px;
  overflow-y: auto;
}

.mext-results:not(:empty) {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.mext-results li {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--spacing-sm);
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
}

.mext-results li:last-child {
  border-bottom: none;
}

.mext-result-meta {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.mext-message {
  cursor: default;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.food-list-empty {
  color: var(--color-text-muted);
  font-size: 0.9rem;
}
```

使用しているCSS変数(`--color-text-muted`, `--color-border`, `--color-bg`, `--radius-sm`,
`--spacing-xs`, `--spacing-sm`, `--spacing-md`)はすべて `style.css` の `:root` に定義済みで、
新たに追加する変数はない。

- [ ] **Step 3: ブラウザで動作確認する**

前回と違うポート番号でサーバーを起動する。

```bash
python -m http.server 8802
```

`http://localhost:8802/` を実ブラウザで開き、下部ナビの「食品」から以下を確認する。

- 画面上部に「成分表から探す」の検索欄があり、その下に登録フォーム、さらに下に登録済み一覧が並んでいること
- 登録済みが0件のとき「まだ食品が登録されていません。…」の案内が出ること
- 検索欄に「精白米」と入力すると候補が表示され、各行に品目名と「穀類 / 342kcal」のような補足が出ること
- 候補をクリックすると登録フォームに名前と栄養値が入り、食品名が全選択された状態になること
- 名前を「白米」に打ち替えて「保存」を押すと、登録済み一覧に「白米(156kcal/100g)」が追加されること(「こめ ［水稲めし］ 精白米 うるち米」を選んだ場合)
- devtoolsの Application → IndexedDB → foods で、保存されたレコードに `mextCode: "01088"` と `source: "custom"` が入っていること
- 存在しない語(例「そんな食品はない」)を入力すると「該当する品目がありません」と出ること
- 検索欄を空にすると候補リストが消えること
- 栄養値の欄にマイナス値を入れて保存しようとすると、ブラウザのバリデーションで止められること
- 登録済み食品の「編集」「削除」が引き続き動作すること
- devtoolsコンソールにエラーが出ていないこと

- [ ] **Step 4: コミットする**

```bash
git add js/foodForm.js style.css
git commit -m "feat: 食品管理画面から成分表を検索して登録できるようにする"
```

---

### Task 6: 食品未登録時の案内とService Workerのキャッシュを更新する

白紙状態で食事記録を開いたときの行き止まりを解消し、新しいファイル構成をオフラインキャッシュに反映する。

**Files:**
- Modify: `js/mealForm.js`(モーダルのHTML生成部分と初期表示)
- Modify: `sw.js:1-15`(`CACHE_NAME` と `ASSETS`)

**Interfaces:**
- Consumes: Task 3で白紙になった `foods`(`js/app.js` の `state.foods` として渡される)、Task 4の `js/mextTable.js`(キャッシュ対象として)
- Produces: なし(このタスクが最終消費者)

- [ ] **Step 1: `js/mealForm.js` に未登録時の案内を追加する**

`js/mealForm.js` を開き、`modalRoot.innerHTML` に代入しているテンプレート文字列の中で、`<form id="meal-form">` の開始タグの直後(食品名の `<label>` の直前)に以下の1行を挿入する。

```html
          ${foods.length === 0 ? '<p class="meal-no-foods">まだ食品が登録されていません。下部の「食品」から登録してください。</p>' : ''}
```

- [ ] **Step 2: `style.css` に案内文のスタイルを追記する**

`style.css` の末尾に以下を追加する。

```css
.meal-no-foods {
  margin: 0 0 var(--spacing-sm) 0;
  padding: var(--spacing-sm);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  font-size: 0.85rem;
}
```

- [ ] **Step 3: `sw.js` を更新する**

`sw.js` の1行目から15行目(`CACHE_NAME` の定義と `ASSETS` 配列)を以下に置き換える。

```js
const CACHE_NAME = 'calorie-app-v3';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './data/mext-foods.json',
  './js/app.js',
  './js/db.js',
  './js/nutrition.js',
  './js/foodSearch.js',
  './js/mextTable.js',
  './js/render.js',
  './js/mealForm.js',
  './js/foodForm.js',
  './js/settings.js',
];
```

- [ ] **Step 4: ブラウザで動作確認する**

前回と違うポート番号でサーバーを起動する。

```bash
python -m http.server 8803
```

`http://localhost:8803/` を実ブラウザで開き、以下を確認する。

- 食品を1件も登録していない状態で「朝食」の「＋ 追加」を押すと、モーダル上部に「まだ食品が登録されていません。…」の案内が出ること
- 食品を1件登録した後に同じモーダルを開くと、その案内が出ないこと
- 登録した食品名の一部を入力すると、候補プルダウンに表示され、選んで保存できること
- devtoolsの Application → Service Workers で、有効なキャッシュ名が `calorie-app-v3` になっていること(古い `calorie-app-v2` が残っている場合は、一度「Unregister」してから再読み込みする)
- devtoolsの Network タブを Offline にして再読み込みしても、アプリが起動し、成分表の検索ができること
- devtoolsコンソールにエラーが出ていないこと

- [ ] **Step 5: 全テストを実行する**

```bash
node --test tests/ && cd tools && python -m unittest test_build_food_database && cd ..
```

期待する結果: JavaScript側・Python側ともにすべて PASS。

- [ ] **Step 6: コミットする**

```bash
git add js/mealForm.js style.css sw.js
git commit -m "feat: 食品未登録時の案内を追加しService Workerのキャッシュを更新する"
```

---

### Task 7: 運用手順をREADMEに記録する

成分表を更新したくなったときに、何を実行すればよいか分かるようにする。

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: Task 2の `tools/build_food_database.py`
- Produces: なし

- [ ] **Step 1: `README.md` を作成する**

リポジトリ直下に `README.md` を新規作成し、以下を書く。

````markdown
# カロリー計算アプリ

食事のカロリー・PFC(タンパク質・脂質・糖質)・塩分を記録する、ビルド不要の静的PWA。
データはブラウザのIndexedDBに保存され、外部への通信は行わない。

## 起動方法

ローカルサーバーで配信して開く(`file://` ではESモジュールとService Workerが動かない)。

```bash
python -m http.server 8800
```

`http://localhost:8800/` をブラウザで開く。

開発中にコードを変更したのに反映されない場合は、Service Workerが古いキャッシュを
返している。devtoolsの Application → Service Workers から Unregister するか、
違うポート番号で開き直す。

## 食品データベースについて

食品一覧は白紙の状態から始まり、「食品」画面で日本食品標準成分表を検索して
選んだ品目だけが登録される。食事記録の候補には、この登録済み食品だけが出る。

同梱している `data/mext-foods.json` は、以下の公式データから生成したものである。

- 出典: 文部科学省「日本食品標準成分表(八訂)増補2023年」第2章(データ)
- https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html

`docs/成分表/` に食品群ごとのMarkdownを置いており、Obsidianから値を検索・確認できる。

### 成分表を更新する

文科省が成分表を改訂したときは、以下を実行する。

```bash
python tools/build_food_database.py
```

`tools/cache/mext_seibun.xlsx` が無ければ自動でダウンロードする(このディレクトリは
gitで追跡していない)。改訂版を取り込む場合は、`tools/build_food_database.py` の
`SOURCE_URL` を新しいURLに書き換え、`tools/cache/` を削除してから実行する。

実行すると `data/mext-foods.json` と `docs/成分表/*.md` が再生成され、
品目数・kcalが0の件数・糖質のクランプ件数が表示される。想定から外れると警告が出る。

## テスト

```bash
node --test tests/
```

```bash
cd tools && python -m unittest test_build_food_database
```
````

- [ ] **Step 2: 記載されたコマンドが実際に動くことを確認する**

READMEに書いた3つのコマンドをそのまま実行し、エラーにならないことを確認する。

```bash
node --test tests/
```

```bash
cd tools && python -m unittest test_build_food_database && cd ..
```

```bash
python tools/build_food_database.py
```

3つ目を実行した後、`git status` で `data/mext-foods.json` と `docs/成分表/` に
差分が出ていないことを確認する(スクリプトが冪等であることの確認)。
生成日を含むMarkdownは実行日が変わると差分が出るため、日付行のみの差分であれば問題ない。

- [ ] **Step 3: コミットする**

```bash
git add README.md
git commit -m "docs: 起動方法と成分表の更新手順をREADMEに記録する"
```
