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
node --test tests/*.test.js
```

```bash
cd tools && python -m unittest test_build_food_database
```
