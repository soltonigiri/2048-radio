# Cloudflare Pagesで公開する

GitHubと連携すると、`main` の更新時に自動で公開できます。

1. Cloudflareの「Workers & Pages」から「Create application」→「Pages」→「Import an existing Git repository」を開きます。
2. GitHubの `soltonigiri/2048-radio` を選びます。表示されない場合は、CloudflareのGitHubアプリにこのリポジトリへのアクセスを許可します。
3. 次の設定を入力してデプロイします。

| 項目 | 設定値 |
| --- | --- |
| Production branch | `main` |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | 空欄（リポジトリのルート） |
| Environment variables | `NODE_VERSION` = `22` |

完了すると `*.pages.dev` のURLが発行されます。ページを開いてSTARTを押し、音楽・手拍子・盤面が動くことを確認してください。

配信するのは `dist/` の静的ファイルです。AIもブラウザ内で動くため、Pages Functionsや有料のAPIは使いません。音源とライセンス表示もビルドに含まれます。

Freeプランは月500ビルド、1ファイル25 MiBまでです。静的ファイルへのリクエストは無料・無制限です。同梱BGMは約6.2 MBで、ファイルサイズ制限内に収まります。独自ドメインを使わなければ、ドメインの購入も不要です。

公式資料：[静的サイトの公開](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/) · [GitHub連携](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/) · [無料枠の上限](https://developers.cloudflare.com/pages/platform/limits/) · [静的配信の料金](https://developers.cloudflare.com/pages/functions/pricing/)
