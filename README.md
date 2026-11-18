# Task Manage DataTeam

Netlifyで動作する、データチーム専用の1ユーザー向けタスク管理アプリです。画面側には認証情報や署名用の秘密情報を一切渡しません。ログイン、タスク操作、CSV保存はすべてNetlify Functionsが処理します。

## 構成

- `netlify/`：公開されるHTML、CSS、JavaScript
- `netlify-functions/`：ログイン、セッション、タスク操作を行うサーバー処理
- Netlify環境変数：ユーザー名、パスワード、セッション署名用の秘密値
- Netlify Blobs：`task-manage-datateam-data` 内の非公開 `tasks.csv`
- `netlify/config.js`：公開してよい担当者名だけを管理

公開対象は `netlify` フォルダーだけです。Functionsのソース、テスト、説明書はWebサイトから直接参照できません。

## 1. 担当者を設定する

`netlify/config.js` の一覧だけを変更します。

```js
TASK_OWNERS: Object.freeze(["自分", "田中", "佐藤"]),
```

担当者はタスク上の表示名です。ログインアカウントが増えるわけではありません。

## 2. パスワードを決める

12文字以上の強いパスワードを用意してください。パスワードはNetlifyのFunctions用環境変数だけに保存します。プロジェクトファイル、GitHub、画面側のコードには絶対に書かないでください。

セッション署名用の秘密値を作成します。

```bash
openssl rand -base64 48
```

この値はパスワードとは別にしてください。チャットやGitHubへ貼り付けないでください。

## 3. Netlifyを設定する

1. GitHubリポジトリをNetlifyへ取り込みます。
2. `netlify.toml` が自動で読み込まれるため、ビルドコマンドは不要です。
3. **Project configuration → Environment variables** を開きます。
4. 次の3項目を追加し、対象範囲に **Functions** を含めます。

```text
AUTH_USERNAME=Netlifyで設定する非公開ユーザー名
AUTH_PASSWORD=12文字以上の非公開パスワード
SESSION_SECRET=opensslで作成した32文字以上の秘密値
```

5. 環境変数を追加または変更した後は、本番環境を再デプロイします。

これらの値を `config.js`、`netlify.toml`、GitHub、画面側ファイルへ書かないでください。

## 4. ログインしてCSVを作成する

デプロイ先を開き、Netlifyに設定したユーザー名とパスワードでログインします。最初のタスクを追加すると、非公開の `tasks.csv` が自動作成されます。

CSVの列は次のとおりです。

```text
ID,Title,Description,Owner,Priority,Status,CreatedAt
```

CSVを確認またはダウンロードする場合は、Netlifyの **Data & Storage → Blobs → task-manage-datateam-data → tasks.csv** を開きます。

## ローカルで確認する

```bash
npm install
npx netlify link
npx netlify dev
```

Netlify DevのCSVデータは本番環境と別に保存されます。ローカルの `.env` は `.gitignore` によりGitの対象外です。

## セキュリティ

- パスワードはFunctions環境変数からサーバー内だけで読み取り、一定時間比較で確認します。
- ログイン成功時に、有効期限8時間の署名付きCookieを発行します。
- Cookieには `HttpOnly`、`SameSite=Strict`、本番環境では `Secure` を設定します。
- 同じ接続元から5回ログインに失敗すると、15分間ログインを停止します。
- 接続元は元のIPを保存せず、一方向変換した値だけで管理します。
- 更新系リクエストでは送信元を確認し、外部サイトからの不正操作を防ぎます。
- すべてのタスクAPIはCSVを読む前にログイン状態を確認します。
- CSV更新は強い整合性とETagを使用し、同時更新による上書きを防ぎます。
- 入力値の長さと選択値をサーバー側で検証します。
- カンマ、引用符、改行を含む文章を安全にCSVへ保存できます。
- 数式として解釈される可能性がある入力を無効化します。
- 画面側は `AUTH_USERNAME`、`AUTH_PASSWORD`、`SESSION_SECRET` を読み取りません。

`SESSION_SECRET` を変更すると、現在の全セッションを直ちに無効化できます。パスワードが漏れた可能性がある場合は、`AUTH_PASSWORD` と `SESSION_SECRET` の両方を変更してください。

## テスト

```bash
npm run check
```

## 問題がある場合

- **サーバー設定エラー**：3つの環境変数とFunctionsの対象範囲を確認し、再デプロイしてください。
- **ログインできない**：ユーザー名とパスワードは大文字・小文字を区別します。
- **ログイン試行上限**：15分待ってから再度ログインしてください。
- **Functionsが見つからない**：リポジトリのルートからNetlifyへ取り込み、`netlify.toml` が検出されているか確認してください。
- **同時更新エラー**：画面を再読み込みしてから、もう一度操作してください。
- **CSVが見つからない**：CSVは最初のタスク追加時に作成されます。
