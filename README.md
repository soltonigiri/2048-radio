# 2048 Radio

AIが2048を自動プレイする、音楽付きのWebアプリ。ジャズに合わせてタイルが動き、合体すると手拍子が鳴ります。

公開サイト：[2048 Radio](https://2048-radio.pages.dev/)

## 起動

Node.js 22以降で実行します。追加パッケージやAPIキーは不要です。

```sh
npm start
```

[localhost:2048](http://localhost:2048) を開き、**START**で再生します。音源は同梱しています。

## 操作

- START／再生ボタン・Space：開始、一時停止、再開
- ½・1・2・4：1拍あたりの手数を変更（初期値は1）
- MAX：AIの計算が終わるたびに進行
- スピーカー・音量スライダー：ミュート、音量調整
- 👏：手拍子のオン・オフ
- 次の盤面：新しいゲームを開始

速度を変えても曲の速さは変わりません。別タブでも再生が続き、ゲームが終わると次の盤面へ進みます。

## 開発

`npm test` でテストを実行できます。AIの構成と再ビルド方法は [engine/README.md](engine/README.md) を参照してください。

## Web公開

`npm run build` で配信用の `dist/` を生成します。[Cloudflare Pagesでの公開手順](docs/deploy.md)を参照してください。

## ライセンス

本体コードは [MIT License](LICENSE) で公開しています。同梱AIの著作権表示とMITライセンスは `vendor/2048-ai/LICENSE` に保存しています。音源には、以下の個別ライセンスが適用されます。

## クレジット

- BGM：[Lobby Time](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1600054) — Kevin MacLeod（[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)）。音源ファイルは未加工で、再生時に音量とフェードを調整しています。
- 手拍子：[Hand Clap](https://freesound.org/people/stuntstudio/sounds/421711/) — stuntstudio（[CC0](https://creativecommons.org/publicdomain/zero/1.0/)）。切り出し・フェード・音量調整をしています。
- AI：[nneonneo/2048-ai](https://github.com/nneonneo/2048-ai)（[MIT License](vendor/2048-ai/LICENSE)）をWebAssembly向けに移植しています。

音源の出典と加工内容は [assets/audio/sources.json](assets/audio/sources.json) に記録しています。
