# 久留米市「料理の栄養価一覧」取り込みと料理検索機能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 福岡県久留米市が公開するオープンデータ「料理の栄養価一覧」(CC BY、286品目)をアプリ用JSONとObsidian閲覧用Markdownに変換し、食品管理画面に既存の「成分表から探す」とは別の「料理から探す」検索欄を新設して、完成した料理名(親子丼・カツ丼・肉じゃがなど)からも食品を登録できるようにする。

**Architecture:** Pythonの変換スクリプト(`tools/build_dish_database.py`)が久留米市公開のCSVから`data/kurume-dishes.json`と`docs/料理/*.md`を生成する。元データは「1人前」あたりの値だが、材料重量の合計で割ってper100gに逆算し、既存のデータモデル(`per100gの値 × 入力g数`)にそのまま乗せる。アプリ側は新規モジュール`js/dishTable.js`(`js/mextTable.js`と同じ構造)が料理データを遅延読み込み・検索し、`js/foodForm.js`に「料理から探す」セクションを追加する。

**Tech Stack:** Python 3標準ライブラリ(`csv`・`json`・`urllib.request`。xlsx変換と異なりopenpyxlは不要)、素のJavaScript(ESモジュール)、素のCSS、IndexedDB。新規の外部ライブラリは追加しない。

## Global Constraints

- ビルド不要の静的PWA構成を維持する(バンドラ・フレームワーク導入禁止)。
- アプリ実行時のネットワーク通信は追加しない。料理データJSONは同梱ファイルを`fetch`するのみ。
- 既存の`escapeHtml`によるXSS対策パターンを崩さない。
- 栄養素の内部フィールド名は既存の`kcal`/`protein`/`fat`/`carb`/`salt`を使う。
- 久留米市データの元の値は「1人前」単位であり、per100gへの換算式は次のとおり: `per100g.kcal = round(1人前のエネルギー ÷ 材料重量の合計g × 100, 1)`(他の4項目も同様)。材料重量の合計が0の行は変換をスキップし警告を出す。
- DBバージョンの変更は不要(`kurumeId`はIndexedDBの既存レコードに追加する任意フィールドであり、マイグレーション不要)。
- 出典表記は「久留米市『料理の栄養価一覧』(CC BY)」とする。

---

### Task 1: 変換スクリプトの純粋関数をTDDで実装する

CSVの読み込みを伴わない純粋関数(材料パース・重量合計・per100g換算・カテゴリ番号割当)を先にテスト付きで作る。この時点ではまだファイル出力は行わない。

**Files:**
- Create: `tools/build_dish_database.py`
- Create: `tools/test_build_dish_database.py`

**Interfaces:**
- Consumes: なし(このタスクが起点)
- Produces:
  - `parse_ingredients(row) -> list[tuple[str, float]]` — CSVの1行(50列のリスト)から、材料名と重量(g)のペアのリストを返す
  - `ingredient_weight_total(ingredients) -> float` — 材料の重量を合計する
  - `calc_per100g(per_serving, weight_total) -> dict | None` — 1人前の栄養値と材料重量合計からper100gを算出する。`weight_total`が0のときは`None`を返す
  - `number_categories(category_sequence) -> dict[str, int]` — カテゴリ名の並び(重複あり)から、初出順に1始まりの番号を割り当てる

- [ ] **Step 1: 失敗するテストを書く**

`tools/test_build_dish_database.py` を新規作成し、以下を書く。

```python
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
```

- [ ] **Step 2: テストを実行して失敗を確認する**

```bash
cd tools && python -m unittest test_build_dish_database -v
```

期待する結果: `ModuleNotFoundError: No module named 'build_dish_database'` で失敗する。

- [ ] **Step 3: 純粋関数を実装する**

`tools/build_dish_database.py` を新規作成し、以下を書く。

```python
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
```

- [ ] **Step 4: テストを実行して成功を確認する**

```bash
cd tools && python -m unittest test_build_dish_database -v
```

期待する結果: 12件すべて PASS。

- [ ] **Step 5: コミットする**

```bash
git add tools/build_dish_database.py tools/test_build_dish_database.py
git commit -m "feat: 久留米市データ変換スクリプトの材料パース・per100g換算をTDDで実装"
```

---

### Task 2: CSVを読み込んでJSONとMarkdownを出力する

Task 1の純粋関数を使い、CSVのダウンロード・読み込み・出力・検証を実装してスクリプトを完成させ、実際に生成物をコミットする。

**Files:**
- Modify: `tools/build_dish_database.py`(Task 1で作成したファイルに追記)
- Create: `data/kurume-dishes.json`(スクリプトの生成物)
- Create: `docs/料理/01_ごはん.md` 〜 `docs/料理/25_調味料.md`(スクリプトの生成物、25ファイル)

**Interfaces:**
- Consumes: Task 1の `parse_ingredients(row)`, `ingredient_weight_total(ingredients)`, `calc_per100g(per_serving, weight_total)`, `number_categories(category_sequence)`
- Produces:
  - `data/kurume-dishes.json` — 配列。各要素は `{"code": "K011", "group": "ごはん", "name": "親子丼", "per100g": {"kcal": 132.5, "protein": 5.7, "fat": 1.8, "carb": 22.1, "salt": 0.4}}`。この形式を Task 3 の `js/dishTable.js` が読む。

- [ ] **Step 1: `tools/build_dish_database.py` に読み込み・出力処理を追記する**

Task 1で書いたファイルの末尾(`number_categories`関数の定義の後)に以下を追記する。まずファイル先頭のdocstringの直後に必要なimportと定数を追加する。

`FIRST_INGREDIENT_COLUMN = 8` の行の**前**に以下を挿入する。

```python
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

```

ファイル末尾(`number_categories`関数の定義の後)に以下を追記する。

```python
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
```

- [ ] **Step 2: スクリプトを実行して生成物を作る**

```bash
python tools/build_dish_database.py
```

期待する出力:

```
書き出しました: .../data/kurume-dishes.json (286品目)
書き出しました: .../docs/料理 (25ファイル)
検証: 286品目
```

警告が標準エラーに出ないこと。`料理データをダウンロードしています` の行は初回のみ表示される。

- [ ] **Step 3: 生成物を目視で検証する**

以下を実行し、親子丼のレコードが設計どおりの値になっていることを確認する。

```bash
python -c "import json,io; d=json.load(io.open('data/kurume-dishes.json',encoding='utf-8')); print(len(d)); print([x for x in d if x['name']=='親子丼'])"
```

期待する結果: 件数が `286`、親子丼のレコードが
`{'code': 'K011', 'group': 'ごはん', 'name': '親子丼', 'per100g': {'kcal': 132.5, 'protein': 5.7, 'fat': 1.8, 'carb': 22.1, 'salt': 0.4}}`
と一致すること。

続いて、生成されたMarkdownの1つを確認する。

```bash
ls "docs/料理/" && head -15 "docs/料理/01_ごはん.md"
```

期待する結果: 25ファイルが存在し、`01_ごはん.md` の見出しが `# ごはん`、品目数が `18`、親子丼の項目に1人前の値(665kcal等)と可食部100gあたりの値(132.5kcal等)、材料リストが記載されていること。

- [ ] **Step 4: コミットする**

```bash
git add tools/build_dish_database.py data/kurume-dishes.json "docs/料理"
git commit -m "feat: 久留米市の料理栄養価CSVからJSONとMarkdownを生成し全286品目を取り込む"
```

---

### Task 3: 料理データの読み込みと検索モジュールをTDDで実装する

`js/mextTable.js` と同じ構造で、料理データを遅延読み込みし、料理名で検索するモジュールを作る。UIへの接続は Task 4 で行う。

**Files:**
- Create: `js/dishTable.js`
- Create: `tests/dishTable.test.js`

**Interfaces:**
- Consumes: `data/kurume-dishes.json`(Task 2の生成物)
- Produces:
  - `loadDishTable(): Promise<Dish[]>` — 料理データJSONを取得する。2回目以降はキャッシュを返す。
  - `searchDishes(table, query, limit = 50): Dish[]` — 料理名の部分一致で検索し、前方一致を優先して最大 `limit` 件返す。
  - `Dish` は `{ code: string, group: string, name: string, per100g: { kcal, protein, fat, carb, salt } }`。

- [ ] **Step 1: 失敗するテストを書く**

`tests/dishTable.test.js` を新規作成し、以下を書く。

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { searchDishes } from '../js/dishTable.js';

const TABLE = [
  { code: 'K011', group: 'ごはん', name: '親子丼', per100g: { kcal: 132.5, protein: 5.7, fat: 1.8, carb: 22.1, salt: 0.4 } },
  { code: 'K012', group: 'ごはん', name: 'カツ丼', per100g: { kcal: 176.2, protein: 6.2, fat: 6.3, carb: 21.8, salt: 0.6 } },
  { code: 'K039', group: '麺', name: 'かけうどん', per100g: { kcal: 45.0, protein: 1.5, fat: 0.3, carb: 8.9, salt: 0.4 } },
  { code: 'K045', group: '肉料理＿煮物・茹でる', name: '肉じゃが', per100g: { kcal: 78.0, protein: 4.3, fat: 1.3, carb: 11.7, salt: 1.2 } },
];

test('空クエリでは空配列を返す', () => {
  assert.deepEqual(searchDishes(TABLE, ''), []);
});

test('空白のみのクエリでは空配列を返す', () => {
  assert.deepEqual(searchDishes(TABLE, '   '), []);
});

test('料理名の部分一致で検索できる', () => {
  const results = searchDishes(TABLE, '丼');
  assert.equal(results.length, 2);
});

test('該当がなければ空配列を返す', () => {
  assert.deepEqual(searchDishes(TABLE, 'そんな料理はない'), []);
});

test('前方一致する品目を部分一致より先に返す', () => {
  const results = searchDishes(TABLE, '肉じゃが');
  assert.equal(results[0].name, '肉じゃが');
});

test('前方一致が後方にある品目より優先される', () => {
  const table = [
    { code: 'x1', group: 'a', name: '味噌カツ丼', per100g: {} },
    { code: 'x2', group: 'a', name: '丼物セット', per100g: {} },
  ];
  const results = searchDishes(table, '丼');
  assert.equal(results[0].code, 'x2');
});

test('limitで件数を打ち切る', () => {
  const table = Array.from({ length: 100 }, (_, i) => ({
    code: String(i), group: 'ごはん', name: `テスト料理${i}`, per100g: {},
  }));
  assert.equal(searchDishes(table, 'テスト').length, 50);
  assert.equal(searchDishes(table, 'テスト', 10).length, 10);
});

test('大文字小文字を区別しない', () => {
  const table = [{ code: 'x', group: 'a', name: 'BLTサンドイッチ', per100g: {} }];
  assert.equal(searchDishes(table, 'blt').length, 1);
});

test('前後の空白を無視して検索する', () => {
  assert.equal(searchDishes(TABLE, '  うどん  ').length, 1);
});

test('元の配列を書き換えない', () => {
  const original = [...TABLE];
  searchDishes(TABLE, '丼');
  assert.deepEqual(TABLE, original);
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

```bash
node --test tests/dishTable.test.js
```

期待する結果: `Cannot find module` を含むエラーで失敗する。

- [ ] **Step 3: `js/dishTable.js` を実装する**

`js/dishTable.js` を新規作成し、以下を書く。

```js
const TABLE_URL = 'data/kurume-dishes.json';

// 約100KB弱のJSONを起動時に読むとダッシュボードの初期表示が遅くなるため、
// 食品管理画面を開いたときに初めて読み込み、以後はメモリ上に保持する。
let cachedTable = null;
let inflightRequest = null;

export async function loadDishTable() {
  if (cachedTable) return cachedTable;
  if (inflightRequest) return inflightRequest;

  inflightRequest = (async () => {
    try {
      const response = await fetch(TABLE_URL);
      if (!response.ok) {
        throw new Error(`料理データの取得に失敗しました (${response.status})`);
      }
      cachedTable = await response.json();
      return cachedTable;
    } finally {
      inflightRequest = null;
    }
  })();

  return inflightRequest;
}

export function searchDishes(table, query, limit = 50) {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === '') return [];

  const prefixMatches = [];
  const otherMatches = [];

  for (const dish of table) {
    const name = dish.name.toLowerCase();
    if (name.startsWith(trimmed)) {
      prefixMatches.push(dish);
    } else if (name.includes(trimmed)) {
      otherMatches.push(dish);
    }
    if (prefixMatches.length >= limit) break;
  }

  return [...prefixMatches, ...otherMatches].slice(0, limit);
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

```bash
node --test tests/dishTable.test.js
```

期待する結果: 10件すべて PASS。

- [ ] **Step 5: 既存テストが壊れていないことを確認する**

```bash
node --test tests/*.test.js
```

期待する結果: すべて PASS(既存の22件 + 今回の10件 = 32件)。

- [ ] **Step 6: コミットする**

```bash
git add js/dishTable.js tests/dishTable.test.js
git commit -m "feat: 久留米市料理データの遅延読み込みと検索モジュールをTDDで実装"
```

---

### Task 4: 食品管理画面に「料理から探す」を追加する

Task 3のモジュールを食品管理画面に接続し、料理の候補を選ぶと登録フォームに値が流し込まれるようにする。あわせて、成分表セクションと料理セクションで見た目を揃えるため、CSSクラス名を`mext-*`から`search-*`という共有名に変更する(両セクションが構造的に同一のUIパターンのため)。

**Files:**
- Modify: `js/foodForm.js`(全面書き換え)
- Modify: `style.css`(既存の`.mext-*`クラスを`.search-*`にリネーム)

**Interfaces:**
- Consumes: Task 3の `loadDishTable(): Promise<Dish[]>` と `searchDishes(table, query, limit): Dish[]`、既存の `js/mextTable.js` の `loadMextTable`/`searchMextFoods`、既存の `js/db.js` の `addFood`/`updateFood`/`deleteFood`、既存の `js/render.js` の `escapeHtml`
- Produces: `renderFoodsView(container, db, foods, { prefillName, onChange }): void` — シグネチャは変更しない。呼び出し側の `js/app.js` は変更不要。

- [ ] **Step 1: `style.css` のクラス名をリネームする**

`style.css` 内の以下のセレクタ名をリネームする(`replace_all`で置換して構わない、いずれも他の用途と衝突しない専用クラス名)。

| 変更前 | 変更後 |
|---|---|
| `.mext-help` | `.search-help` |
| `.mext-query` | `.search-query` |
| `.mext-results` | `.search-results` |
| `.mext-results:not(:empty)` | `.search-results:not(:empty)` |
| `.mext-results li` | `.search-results li` |
| `.mext-results li:last-child` | `.search-results li:last-child` |
| `.mext-result-meta` | `.search-result-meta` |
| `.mext-message` | `.search-message` |

CSSの中身(プロパティ・値)は一切変更しない。

- [ ] **Step 2: `js/foodForm.js` を書き換える**

`js/foodForm.js` の内容を以下に置き換える。

```js
import { addFood, updateFood, deleteFood } from './db.js';
import { escapeHtml } from './render.js';
import { loadMextTable, searchMextFoods } from './mextTable.js';
import { loadDishTable, searchDishes } from './dishTable.js';

export function renderFoodsView(container, db, foods, { prefillName = '', onChange } = {}) {
  container.innerHTML = `
    <h2>成分表から探す</h2>
    <p class="search-help">日本食品標準成分表(八訂)増補2023年から選ぶと、栄養値が下のフォームに入ります。</p>
    <input type="search" id="mext-query" class="search-query" placeholder="例: 精白米" autocomplete="off">
    <ul id="mext-results" class="search-results"></ul>

    <h2>料理から探す</h2>
    <p class="search-help">久留米市「料理の栄養価一覧」から選ぶと、栄養値が下のフォームに入ります。</p>
    <input type="search" id="dish-query" class="search-query" placeholder="例: 親子丼" autocomplete="off">
    <ul id="dish-results" class="search-results"></ul>

    <h2>食品の登録・編集</h2>
    <form id="food-form" class="food-form">
      <input type="hidden" id="food-id">
      <input type="hidden" id="food-mext-code">
      <input type="hidden" id="food-kurume-id">
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
  const kurumeIdInput = container.querySelector('#food-kurume-id');
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
  const dishQuery = container.querySelector('#dish-query');
  const dishResults = container.querySelector('#dish-results');

  let mextTable = null;
  let mextLoadFailed = false;
  let dishTable = null;
  let dishLoadFailed = false;

  function resetForm() {
    form.reset();
    idInput.value = '';
    mextCodeInput.value = '';
    kurumeIdInput.value = '';
  }

  function fillForm(food) {
    idInput.value = food.id;
    mextCodeInput.value = food.mextCode ?? '';
    kurumeIdInput.value = food.kurumeId ?? '';
    nameInput.value = food.name;
    kcalInput.value = food.per100g.kcal;
    proteinInput.value = food.per100g.protein;
    fatInput.value = food.per100g.fat;
    carbInput.value = food.per100g.carb;
    saltInput.value = food.per100g.salt;
    nameInput.focus();
  }

  function fillFormFromMext(mextFood) {
    mextCodeInput.value = mextFood.code;
    kurumeIdInput.value = '';
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

  function fillFormFromDish(dish) {
    kurumeIdInput.value = dish.code;
    mextCodeInput.value = '';
    nameInput.value = dish.name;
    kcalInput.value = dish.per100g.kcal;
    proteinInput.value = dish.per100g.protein;
    fatInput.value = dish.per100g.fat;
    carbInput.value = dish.per100g.carb;
    saltInput.value = dish.per100g.salt;
    nameInput.focus();
    nameInput.select();
  }

  function renderSearchMessage(resultsEl, message) {
    resultsEl.innerHTML = `<li class="search-message">${escapeHtml(message)}</li>`;
  }

  function renderMextResults(results) {
    if (results.length === 0) {
      renderSearchMessage(mextResults, '該当する品目がありません。ひらがな・漢字など表記を変えてお試しください(例: 豚肉 → ぶた)');
      return;
    }
    mextResults.innerHTML = results
      .map(
        (food) => `
        <li data-mext-code="${escapeHtml(food.code)}">
          <span class="search-result-name">${escapeHtml(food.name)}</span>
          <span class="search-result-meta">${escapeHtml(food.group)} / ${food.per100g.kcal}kcal</span>
        </li>`
      )
      .join('');
  }

  function renderDishResults(results) {
    if (results.length === 0) {
      renderSearchMessage(dishResults, '該当する料理がありません');
      return;
    }
    dishResults.innerHTML = results
      .map(
        (dish) => `
        <li data-dish-code="${escapeHtml(dish.code)}">
          <span class="search-result-name">${escapeHtml(dish.name)}</span>
          <span class="search-result-meta">${escapeHtml(dish.group)} / ${dish.per100g.kcal}kcal</span>
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
      renderSearchMessage(mextResults, '成分表の読み込みに失敗しました');
      return;
    }
    if (!mextTable) {
      renderSearchMessage(mextResults, '成分表を読み込んでいます...');
      try {
        mextTable = await loadMextTable();
      } catch (err) {
        mextLoadFailed = true;
        renderSearchMessage(mextResults, '成分表の読み込みに失敗しました');
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

  async function handleDishQuery() {
    const query = dishQuery.value;
    if (query.trim() === '') {
      dishResults.innerHTML = '';
      return;
    }
    if (dishLoadFailed) {
      renderSearchMessage(dishResults, '料理データの読み込みに失敗しました');
      return;
    }
    if (!dishTable) {
      renderSearchMessage(dishResults, '料理データを読み込んでいます...');
      try {
        dishTable = await loadDishTable();
      } catch (err) {
        dishLoadFailed = true;
        renderSearchMessage(dishResults, '料理データの読み込みに失敗しました');
        return;
      }
      if (dishQuery.value.trim() === '') {
        dishResults.innerHTML = '';
        return;
      }
    }
    renderDishResults(searchDishes(dishTable, dishQuery.value));
  }

  mextQuery.addEventListener('input', handleMextQuery);
  dishQuery.addEventListener('input', handleDishQuery);

  mextResults.addEventListener('click', (event) => {
    const li = event.target.closest('li[data-mext-code]');
    if (!li || !mextTable) return;
    const mextFood = mextTable.find((f) => f.code === li.dataset.mextCode);
    if (!mextFood) return;
    fillFormFromMext(mextFood);
    mextQuery.value = '';
    mextResults.innerHTML = '';
  });

  dishResults.addEventListener('click', (event) => {
    const li = event.target.closest('li[data-dish-code]');
    if (!li || !dishTable) return;
    const dish = dishTable.find((d) => d.code === li.dataset.dishCode);
    if (!dish) return;
    fillFormFromDish(dish);
    dishQuery.value = '';
    dishResults.innerHTML = '';
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
    const kurumeId = kurumeIdInput.value || undefined;
    if (idInput.value) {
      const existing = foods.find((f) => f.id === idInput.value);
      const updated = { ...existing, name: nameInput.value, per100g };
      if (mextCode) updated.mextCode = mextCode;
      if (kurumeId) updated.kurumeId = kurumeId;
      await updateFood(db, updated);
      Object.assign(existing, updated);
    } else {
      const newFood = { name: nameInput.value, per100g, category: '未分類', source: 'custom' };
      if (mextCode) newFood.mextCode = mextCode;
      if (kurumeId) newFood.kurumeId = kurumeId;
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

- 成分表セクションの下に、同じ見た目の「料理から探す」セクションを追加した。`loadDishTable()`は「料理から探す」を最初に使ったときにだけ呼ばれる。
- `fillFormFromMext`と`fillFormFromDish`は、互いのhidden fieldを空にする(`kurumeIdInput.value = ''`／`mextCodeInput.value = ''`)。1つの食品が成分表由来と料理由来の両方の参照を同時に持つと紛らわしいため、後から選んだ方だけを記録する。
- `renderMextMessage`だった関数は`renderSearchMessage(resultsEl, message)`に一般化し、成分表・料理の両方のメッセージ表示に使う。
- CSSクラス名を`mext-*`から`search-*`に変更したことに伴い、テンプレート内の該当箇所もすべて書き換えた。

- [ ] **Step 3: ブラウザで動作確認する**

前回と違うポート番号でサーバーを起動する(Service Workerの古いキャッシュを避けるため)。

```bash
python -m http.server 8900
```

`http://localhost:8900/` を実ブラウザで開き、下部ナビの「食品」から以下を確認する。

- 画面に「成分表から探す」「料理から探す」の2つの検索欄が独立して並んでいること
- 「料理から探す」に「親子丼」と入力すると候補が表示され、「ごはん / 132.5kcal」のような補足が出ること
- 候補をクリックすると登録フォームに名前と栄養値(132.5kcal / 5.7 / 1.8 / 22.1 / 0.4)が入り、食品名が全選択された状態になること
- 保存すると登録済み一覧に「親子丼(132.5kcal/100g)」が追加されること
- devtoolsの Application → IndexedDB → foods で、保存されたレコードに`kurumeId: "K011"`と`source: "custom"`が入っており、`mextCode`は入っていないこと
- 逆に成分表から候補を選んで保存すると、`mextCode`は入るが`kurumeId`は入らないこと
- 「成分表から探す」で入力しても「料理から探す」の候補一覧には影響がなく、その逆も同様であること(2つの検索欄が独立していること)
- 存在しない語を「料理から探す」に入力すると「該当する料理がありません」と出ること
- 見た目(枠線・余白・フォントサイズ)が成分表セクションと料理セクションで揃っていること(CSSクラスリネームの確認)
- devtoolsコンソールにエラーが出ていないこと

- [ ] **Step 4: コミットする**

```bash
git add js/foodForm.js style.css
git commit -m "feat: 食品管理画面から久留米市の料理データを検索して登録できるようにする"
```

---

### Task 5: Service Workerのキャッシュを更新する

新しいファイル構成(`data/kurume-dishes.json`, `js/dishTable.js`)をオフラインキャッシュに反映する。

**Files:**
- Modify: `sw.js`

**Interfaces:**
- Consumes: Task 2の`data/kurume-dishes.json`、Task 3の`js/dishTable.js`
- Produces: なし

- [ ] **Step 1: `sw.js` の現在の内容を確認する**

```bash
cat sw.js
```

`CACHE_NAME`が`'calorie-app-v3'`、`ASSETS`配列に`js/mextTable.js`等が含まれていることを確認する。

- [ ] **Step 2: `sw.js` を更新する**

`CACHE_NAME`の値を`'calorie-app-v3'`から`'calorie-app-v4'`に変更する。

`ASSETS`配列に、以下の2行を追加する(`'./data/mext-foods.json'`の次に`'./data/kurume-dishes.json'`、`'./js/mextTable.js'`の次に`'./js/dishTable.js'`という並びにする)。

```js
  './data/kurume-dishes.json',
```

```js
  './js/dishTable.js',
```

変更後の`ASSETS`配列全体が以下の内容と一致することを確認する。

```js
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './data/mext-foods.json',
  './data/kurume-dishes.json',
  './js/app.js',
  './js/db.js',
  './js/nutrition.js',
  './js/foodSearch.js',
  './js/mextTable.js',
  './js/dishTable.js',
  './js/render.js',
  './js/mealForm.js',
  './js/foodForm.js',
  './js/settings.js',
];
```

- [ ] **Step 3: ブラウザで動作確認する**

前回と違うポート番号でサーバーを起動する。

```bash
python -m http.server 8910
```

`http://localhost:8910/` を実ブラウザで開き、以下を確認する。

- devtoolsの Application → Service Workers で、有効なキャッシュ名が`calorie-app-v4`になっていること(古いキャッシュが残っている場合は一度Unregisterしてから再読み込みする)
- Application → Cache Storage → calorie-app-v4 に`data/kurume-dishes.json`と`js/dishTable.js`が含まれていること
- devtoolsのNetworkタブをOfflineにして再読み込みしても、アプリが起動し「料理から探す」の検索ができること
- devtoolsコンソールにエラーが出ていないこと

- [ ] **Step 4: 全テストを実行する**

```bash
node --test tests/*.test.js && cd tools && python -m unittest test_build_dish_database && python -m unittest test_build_food_database && cd ..
```

期待する結果: JavaScript側(32件)・Python側(久留米市12件+文科省27件)ともにすべて PASS。

- [ ] **Step 5: コミットする**

```bash
git add sw.js
git commit -m "feat: Service Workerのキャッシュに久留米市の料理データを追加"
```

---

### Task 6: 運用手順をREADMEに記録する

久留米市データを更新したくなったときに、何を実行すればよいか分かるようにする。

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 2の `tools/build_dish_database.py`
- Produces: なし

- [ ] **Step 1: `README.md` の現在の内容を確認する**

```bash
cat README.md
```

「食品データベースについて」セクションに、文科省成分表の説明と更新手順が書かれていることを確認する。

- [ ] **Step 2: `README.md` に久留米市データの説明を追記する**

「### 成分表を更新する」セクションの直後(次の`##`見出しの直前)に、以下を追記する。

````markdown

### 料理データを更新する

食品一覧には、文科省の成分表(生の食材)に加えて、久留米市が公開する「料理の栄養価一覧」(完成した料理286品目)も取り込んでいる。更新する場合は、以下を実行する。

```bash
python tools/build_dish_database.py
```

`tools/cache/kurume_dishes.csv` が無ければ自動でダウンロードする(このディレクトリはgitで追跡していない)。実行すると `data/kurume-dishes.json` と `docs/料理/*.md` が再生成される。

出典: 久留米市「料理の栄養価一覧」(久留米市保健所健康推進課、クリエイティブ・コモンズ表示 CC BY)
https://data.bodik.jp/dataset/402036_0009100_00005
````

「## テスト」セクションの既存のPythonテストコマンドの下に、以下を追記する。

```bash
cd tools && python -m unittest test_build_dish_database
```

- [ ] **Step 3: 記載されたコマンドが実際に動くことを確認する**

READMEに追記した2つのコマンドをそのまま実行し、エラーにならないことを確認する。

```bash
cd tools && python -m unittest test_build_dish_database && cd ..
```

```bash
python tools/build_dish_database.py
```

実行後、`git status`で`data/kurume-dishes.json`と`docs/料理/`に差分が出ていないことを確認する(生成日の行のみの差分であれば問題ない)。

- [ ] **Step 4: コミットする**

```bash
git add README.md
git commit -m "docs: 久留米市の料理データの更新手順をREADMEに記録する"
```
