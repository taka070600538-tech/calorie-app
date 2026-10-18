# カロリー計算アプリ(calorie-app)

このフォルダのファイルを触るときだけ読み込まれる補足ルール。Vault 全体のルールは Vault の `.claude\CLAUDE.md`。

- テスト: このフォルダで `npm test` を実行する(node:test、依存なし)。
- 公開URL: https://taka070600538-tech.github.io/calorie-app/ (master へ push すると GitHub Pages に反映)。
- `sw.js` がキャッシュするファイル(html・js・css など)を変えたら、同じコミットで `CACHE_NAME` の番号を1つ上げる。commit 前フックが更新漏れを止めるが、先に上げておく。push 後は公開URLの `sw.js` を取得して、新しい番号が配信されているか確かめる。
- プレビュー: preview_start の `calorie-app`(localhost:8791)。
