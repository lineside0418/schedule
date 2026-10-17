# seiko.ac.jp ログインの設定手順

この版は設定が済むまでログインできません。設定する値はGoogleのクライアントIDとCloudflareのAPI URLです。個人のGoogleパスワードやクライアントシークレットを入力・共有する必要はありません。

## 1. ソースの入れ替えと依存関係

新しいZIPの `schedule` の中身を、既存のローカル `schedule` に上書きします。既存 `.git` は残します。

```powershell
npm ci
```

GitHubのリポジトリを非公開に戻してください。Pagesは非公開リポジトリで利用できる契約のまま、Sourceを **GitHub Actions** にします。公開用ファイルは必ず `dist/` だけを配信します。Sourceを「Deploy from a branch」のリポジトリルートにはしません。

## 2. GoogleのWebクライアントIDを作る

1. https://console.cloud.google.com/auth/clients を開く。
2. 自分が管理できるGoogle Cloudプロジェクトを選択または作成。
3. Google Auth Platformの初期設定・ブランディングを行う。アプリ名は `2E 時間割` など。
4. 公開対象に合うAudience（対象）を設定。自分の個人アカウントのプロジェクトで学校全体を自動的に「内部」にすることはできません。内部アプリを作れる学校管理プロジェクトでなければExternalを使い、テスト段階では利用する学校アカウントをテストユーザーに追加します。テスト状態は学校全体に配布できる状態ではありません。
5. 「クライアントを作成」→ 種類を **ウェブアプリケーション** にする。
6. **承認済みのJavaScript生成元** に以下を追加。

```text
https://lineside0418.github.io
```

ここには `/schedule/` を付けません。独自ドメインで配信するときは、そのオリジンも別途登録します。

7. この実装はJavaScriptコールバックを使うため、リダイレクトURIは使用しません。
8. 作成された `…apps.googleusercontent.com` の **クライアントID** を控える。クライアントシークレットは使いません。
9. 公開前にブランディング・データアクセス・公開ステータスなど、Googleが求める設定を完了させる。ログインにはopenid/email/profileの基本情報以外を要求しません。

学校の管理ポリシーにより外部アプリのログインを制限している場合は、学校側で許可が必要なことがあります。その場合、アプリ側で制限を迂回することはできません。

初期のプライバシー説明ページは `https://lineside0418.github.io/schedule/privacy.html` です。実際の運用者情報・問い合わせ先などは必要に応じて追記してください。

## 3. Worker側のクライアントIDを設定する

`worker/wrangler.jsonc` の `GOOGLE_CLIENT_ID` を、作成したIDに変更します。

```json
"vars": {
  "GOOGLE_CLIENT_ID": "取得したID.apps.googleusercontent.com",
  "ALLOWED_ORIGINS": "https://lineside0418.github.io"
}
```

ドメイン制限は `worker/src/auth.js` の `seiko.ac.jp` でサーバー側に固定しています。画面側の表示だけを書き換えても、別ドメインのアカウントは認証されません。

クライアントIDは公開識別子です。クライアントシークレットやCloudflare APIトークンをこのファイルに書かないでください。

## 4. Cloudflareに認証APIをデプロイする

Cloudflareアカウントを用意し、`package.json` のあるフォルダで実行します。

```powershell
npx wrangler login
npm run deploy:api
```

Wranglerの初回実行時はパッケージのインストール確認が出ます。ブラウザで自分のCloudflareアカウントにログインして許可します。

完了時に表示されたWorkersのURLを控えます。例：

```text
https://schedule-api.YOUR-SUBDOMAIN.workers.dev
```

APIは `/api/schedule` にあります。ブラウザでURLを直接開いても時間割は返しません。アプリからの認証付きPOSTだけに応答します。

## 5. フロントエンドを設定する

`src/config.js` を編集します。

```js
export const AUTH_CONFIG = Object.freeze({
  allowedDomain: 'seiko.ac.jp',
  googleClientId: 'Googleで取得したID.apps.googleusercontent.com',
  apiUrl: 'https://schedule-api.YOUR-SUBDOMAIN.workers.dev/api/schedule',
});
```

Worker側と同じクライアントIDを使います。URL末尾の `/api/schedule` も含めます。

## 6. テスト・公開

```powershell
npm run check
npm test
npm run build

git add .
git commit -m "Add school Google login and offline timetable access"
git push
```

まだGit初期化していないフォルダでは、先に `git init -b main` と `git remote add origin https://github.com/lineside0418/schedule.git` を実行してください。

GitHubのSettings → Pages → Sourceを **GitHub Actions** に設定し、必要ならActions → Test and deploy to GitHub Pages → Run workflowを実行します。

## 7. 実際のログインとオフラインを確認する

1. 公開ページでGoogleログインボタンを押す。
2. `@seiko.ac.jp` の学校アカウントを選ぶ。
3. 時間割が表示され、「時間割を保存しました」と表示されることを確認。
4. 設定画面に「オフライン利用の準備ができています」と表示されるまで待つ。
5. ホーム画面に追加して起動。初回は起動モードごとにログインが必要になるブラウザもあるため、インストール後の状態でも確認。
6. 機内モードで閉じて開き直し、時間割を表示できることを確認。
7. 別のGoogleアカウント（例：個人Gmail）では取得できないことを確認。
8. 設定からログアウトし、再度Googleログインが必要になることを確認。

すでに旧版PWAを開いている場合は「新しいバージョンがあります」→「更新する」を押します。旧版キャッシュから時間割を認証済みデータとして自動移行はしません。新しい版では最初の学校ログインが必要です。

## 時間割を変更したとき

`worker/src/timetable.js` を変更して、テスト後に `npm run deploy:api` を実行します。各端末は設定 →「Googleで再認証して時間割を更新」で取得します。保存済みデータを無条件に上書きしたり、バックグラウンドでGoogleログインを強制したりはしません。

## 公式資料

- Googleのクライアント設定：https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
- Googleトークンの検証：https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- Cloudflare Wrangler：https://developers.cloudflare.com/workers/wrangler/commands/
