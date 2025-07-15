# LazyChillRoom - Node.js版

このプロジェクトのNode.js版です。Express.js、Socket.io、MySQLを使用してリアルタイムチャットアプリケーションを構築しています。

## 🚀 機能

- **リアルタイムチャット**: Socket.ioを使用したリアルタイムメッセージング
- **ユーザー認証**: JWT認証システム
- **サーバー管理**: Discordライクなサーバー（ギルド）とチャンネル管理
- **ファイル共有**: 画像、動画、ドキュメントのアップロード機能
- **プロフィール管理**: アバターアップロード機能
- **レスポンシブデザイン**: モバイル対応UI

## 🛠️ 技術スタック

### バックエンド
- **Node.js**: サーバーサイドJavaScript
- **Express.js**: Webフレームワーク
- **Socket.io**: リアルタイム通信
- **MySQL**: データベース
- **JWT**: 認証トークン
- **Multer**: ファイルアップロード
- **bcryptjs**: パスワードハッシュ化

### フロントエンド
- **Vanilla JavaScript**: フロントエンド
- **Socket.io Client**: リアルタイム通信
- **CSS3**: スタイリング

## 📦 インストールと起動

### 前提条件
- Node.js 22以上
- Podman & Podman Compose (推奨)

### Podman Composeを使用した起動（推奨）

1. **プロジェクトディレクトリに移動**
   ```bash
   cd lazychillroom_v7
   ```

2. **依存関係をインストール**
   ```bash
   npm install
   ```

3. **Podman Composeでサービスを起動**
   ```bash
   podman-compose up -d
   ```

4. **データベースのマイグレーション**
   ```bash
   npm run migrate
   ```

5. **アクセス**
   - **Webアプリ**: http://localhost:3000
   - **phpMyAdmin**: http://localhost:8081

### ローカル開発環境での起動

1. **MySQL を起動** (別途インストールが必要)

2. **環境変数を設定**
   ```bash
   # .envファイルを作成してデータベース設定を記述
   cp .env .env.local
   # .env.localファイルを編集してローカル環境用の設定に更新
   ```

3. **依存関係をインストール**
   ```bash
   npm install
   ```

4. **データベースマイグレーション**
   ```bash
   npm run migrate
   ```

5. **開発サーバーを起動**
   ```bash
   npm run dev
   ```

## 📁 プロジェクト構造

```
lazychillroom_v7/
├── server.js              # メインサーバーファイル
├── package.json            # 依存関係とスクリプト
├── .env                    # 環境変数設定
├── Dockerfile              # Docker設定
├── podman-compose.yaml     # Podman Compose設定
├── config/
│   └── database.js         # データベース設定
├── middleware/
│   └── auth.js            # 認証ミドルウェア
├── routes/                 # APIルート
│   ├── auth.js            # 認証API
│   ├── channels.js        # チャンネルAPI
│   ├── dm.js              # ダイレクトメッセージAPI
│   ├── files.js           # ファイルAPI
│   ├── friends.js         # フレンドAPI
│   ├── guilds.js          # ギルドAPI
│   ├── messages.js        # メッセージAPI
│   ├── pins.js            # ピン機能API
│   ├── presence.js        # プレゼンス（在線状況）API
│   ├── reactions.js       # リアクションAPI
│   ├── typing.js          # タイピング状況API
│   └── users.js           # ユーザーAPI
├── socket/
│   └── socketHandler.js   # Socket.io ハンドラー
├── migrations/
│   ├── initDatabase.js    # データベース初期化
│   ├── add_last_activity.js # 最終活動時刻追加
│   └── update_default_channels.js # デフォルトチャンネル更新
├── public/                # 静的ファイル
│   ├── index.html         # メインHTML
│   ├── css/               # スタイルシート
│   └── js/                # フロントエンドJS
└── uploads/               # アップロードファイル保存
```

## 🔧 API エンドポイント

### 認証
- `POST /api/auth/register` - ユーザー登録
- `POST /api/auth/login` - ログイン
- `GET /api/auth/verify` - トークン検証

### メッセージ
- `GET /api/messages` - メッセージ取得
- `POST /api/messages` - メッセージ送信
- `DELETE /api/messages/:id` - メッセージ削除

### ギルド
- `GET /api/guilds` - ギルド一覧取得
- `GET /api/guilds/:id` - ギルド詳細取得
- `POST /api/guilds` - ギルド作成
- `POST /api/guilds/join/:inviteCode` - ギルド参加

### チャンネル
- `GET /api/channels/guild/:guildId` - チャンネル一覧取得
- `POST /api/channels` - チャンネル作成
- `PUT /api/channels/:id` - チャンネル更新
- `DELETE /api/channels/:id` - チャンネル削除

### ファイル
- `POST /api/files/upload` - ファイルアップロード
- `GET /api/files/:id` - ファイル取得
- `DELETE /api/files/:id` - ファイル削除

## 🔌 Socket.io イベント

### クライアント → サーバー
- `join_guilds` - ユーザーのギルドに参加
- `join_channel` - 特定のチャンネルに参加
- `leave_channel` - チャンネルから離脱
- `typing_start` - タイピング開始
- `typing_stop` - タイピング停止

### サーバー → クライアント
- `new_message` - 新しいメッセージ
- `message_deleted` - メッセージ削除
- `user_joined` - ユーザー参加
- `user_left` - ユーザー離脱
- `user_typing` - ユーザータイピング中

## 🛡️ セキュリティ機能

- **JWT認証**: セキュアなトークンベース認証
- **Rate Limiting**: API呼び出し制限
- **CORS設定**: クロスオリジンリクエスト制御
- **Helmet**: セキュリティヘッダー設定
- **パスワードハッシュ化**: bcryptjsによる安全なパスワード保存
- **ファイルアップロード制限**: ファイルタイプとサイズの制限

## 🚧 開発状況

### 完了済み
- ✅ 基本的なRESTful API
- ✅ Socket.ioによるリアルタイム通信
- ✅ ユーザー認証システム
- ✅ ギルドとチャンネル管理
- ✅ メッセージング機能
- ✅ ファイルアップロード機能
- ✅ プレゼンス（在線状況）管理
- ✅ タイピング状況表示
- ✅ ピン機能
- ✅ リアクション機能
- ✅ DM（ダイレクトメッセージ）
- ✅ フレンド機能
- ✅ Docker/Podman環境

### 今後の実装予定
- 🔄 ボイスチャット機能
- 🔄 通知システム
- 🔄 絵文字とカスタム絵文字
- 🔄 モデレーション機能
- 🔄 サーバーブースト機能

## 📝 ライセンス

MIT License

## 🤝 コントリビューション

1. このリポジトリをフォーク
2. 機能ブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add some amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## 📞 サポート

問題や質問がある場合は、GitHubのIssueを作成してください。
