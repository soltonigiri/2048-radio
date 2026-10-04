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

配信用の`dist/`には音源とライセンス表示も含まれます。

詳細はCloudflareの[静的サイトの公開](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/)と[GitHub連携](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/)を参照してください。
