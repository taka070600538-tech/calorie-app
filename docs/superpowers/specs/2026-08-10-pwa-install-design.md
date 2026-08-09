# スマホインストール対応(GitHub Pages公開)設計書

日付: 2026-08-10
ステータス: 承認済み

## 目的

カロリー計算アプリ(静的PWA)をGitHub Pagesで公開し、AndroidのChromeから
「ホーム画面に追加」でインストールできるようにする(オフライン動作込み)。

## 決定事項

- **公開先**: GitHub Pages(公開リポジトリ `calorie-app`、無料・HTTPS)
- **対象スマホ**: Android(Chrome)。iPhone用のapple-touch-iconは追加しない。
- **データの扱い**: 食事記録データは端末のIndexedDB内にのみ保存され、外部送信は一切なし(現行設計のまま)。公開されるのはコードのみ。
- **リポジトリ作成**: `gh` CLIが無いため、ユーザーがGitHub上で空の公開リポジトリを手動作成し、pushはGit Credential Manager(ブラウザ認証)で行う。

## 変更内容(コード側)

1. **PNGアイコン追加** — 既存の `icons/icon.svg` をブラウザのcanvasでラスタライズして生成:
   - `icons/icon-192.png`(192×192、purpose: any)
   - `icons/icon-512.png`(512×512、purpose: any)
   - `icons/icon-maskable-512.png`(512×512、purpose: maskable。Androidの丸型マスクで
     図柄が欠けないよう、背景色で全面を塗り、図柄を中央80%の安全域に収めた版)
2. **manifest.json** — 上記PNG 3つを `icons` に追記(既存のSVGエントリも残す)。
3. **sw.js** — アイコンファイルを `ASSETS` に追加し、`CACHE_NAME` を `calorie-app-v7` に更新。

パスはすべて相対(`./`)のため、`https://<ユーザー名>.github.io/calorie-app/` の
サブパス配下でも修正不要で動作する。

## 公開手順

1. ユーザー: https://github.com/new で空の公開リポジトリ `calorie-app` を作成(README等なし)
2. Claude: `git remote add origin` → `git push -u origin master`(認証はGit Credential Manager)
3. ユーザー: リポジトリの Settings → Pages → Source: Deploy from a branch → `master` / `(root)`
4. Claude: 公開URLをブラウザで開き、manifest・アイコン・Service Workerの配信を確認
5. ユーザー: スマホのChromeで公開URLを開き「ホーム画面に追加」でインストール(手順は都度案内)

## 確認方法

- 公開URLで `manifest.json`・PNGアイコン・`sw.js` が200で配信されること
- ブラウザでService Workerが登録され、アプリが正常に描画されること
- スマホでのインストールと起動(最終確認はユーザー)

## やらないこと(YAGNI)

- iPhone用 apple-touch-icon
- GitHub Actionsによるデプロイ(静的ファイルのみのためbranch配信で十分)
- 記録データのGitHub同期
