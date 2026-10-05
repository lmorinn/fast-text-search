# FM-index Text Search

FM-indexとWavelet MatrixをWebAssemblyで動かす、ブラウザ完結のテキスト検索アプリです。テキストファイルはサーバーへ送信せず、ブラウザ内で処理します。

## ローカルで実行

`file://` ではWasmを読み込めないため、ローカルサーバーを使用します。

```bash
python3 -m http.server 8000
```

ブラウザで <http://localhost:8000> を開いてください。

## 操作

- `.txt` ファイルを選択してインデックスを作成
- 検索欄に文字列を入力
- `Enter` で次のマッチ、`Shift + Enter` で前のマッチへ移動

## Cloudflare Pages

GitHubリポジトリをCloudflare Pagesに接続し、次の設定でデプロイできます。

- Production branch: `main`
- Build command: `exit 0`
- Build output directory: `/`

フレームワークやサーバー処理は不要です。
