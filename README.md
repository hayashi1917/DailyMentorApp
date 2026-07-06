# Daily Mentor Agent 🌱

日々のタスク管理と習慣化を支援する、対話型AIメンターPWAアプリです。

単なるToDoアプリではなく、朝チェックイン・未完了タスク・過去の振り返り・AI提案へのフィードバックをもとに、**あなたに合った1日の計画**を提案します。

## コンセプト

- **3日坊主を防ぐ** — 完璧より継続
- **できなかった日を責めない** — 失敗した日は「取り返す日」ではなく「復帰する日」
- **3段階の計画** — 最低ライン / 標準ライン / 余裕ラインを分ける
- **Recovery Mode** — 崩れたときは、復帰しやすい最小行動(5〜15分)に圧縮する
- **使うほど学習** — レビューとフィードバックから生活リズムとメンターの振る舞いを学習する
- **AIは命令者ではなくメンター** — 「やるべき」ではなく「こうすると戻りやすい」

## 技術スタック

- Next.js (App Router) / TypeScript
- Tailwind CSS v4
- Supabase Auth / Supabase Postgres (RLS有効・pgvector)
- OpenAI API(計画生成・チャット・埋め込み)
- Zod (AI出力の検証)
- Google Calendar API(空き時間検出・作業ブロック登録)
- Web Push (VAPID) + Service Worker(オフライン対応)
- スマホファーストUI / PWA(manifest + インストール促進UX)

## ローカル起動方法

### 1. 依存関係のインストール

```bash
npm install
```

### 2. Supabaseプロジェクトの作成

1. [supabase.com](https://supabase.com) でプロジェクトを作成
2. **Project Settings > API** から `Project URL` と `anon public` キーを控える

### 3. migrationの適用

以下のいずれかの方法で `supabase/migrations/0001_init.sql` を実行します。

**方法A: SQL Editor(かんたん)**

Supabaseダッシュボードの **SQL Editor** で、以下を順番に実行:

1. `supabase/migrations/0001_init.sql`(基本テーブル + RLS)
2. `supabase/migrations/0002_phase2.sql`(Google連携・Push購読・pgvector・サブタスク)
3. `supabase/migrations/0003_workflow.sql`(時刻つきスケジュール・リアルタイム計測)

**方法B: Supabase CLI**

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

migrationには全テーブルの作成・RLSポリシー・サインアップ時にprofilesを自動作成するトリガー・pgvector拡張とベクトル検索関数が含まれます。

### 4. 環境変数の設定

```bash
cp .env.example .env.local
```

`.env.local` を編集します。

| 変数 | 必須 | 説明 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | SupabaseのProject URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabaseのanon public key |
| `OPENAI_API_KEY` | ✅ | OpenAIのAPIキー([platform.openai.com](https://platform.openai.com/api-keys)で発行)。サーバーサイドのみで使用され、クライアントには出ません |
| `OPENAI_MODEL` | - | 使用モデル。デフォルト `gpt-4o-mini` |
| `NEXT_PUBLIC_APP_URL` | - | アプリのURL(OAuthリダイレクトに使用)。デフォルト `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | - | Googleカレンダー連携用(下記参照)。未設定なら連携機能は非表示のまま動作します |
| `TOKEN_ENCRYPTION_KEY` | - | 保存するGoogleトークンの暗号化キー(`openssl rand -base64 32` などで生成) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | - | Webプッシュ通知用。`npx web-push generate-vapid-keys` で生成 |
| `VAPID_SUBJECT` | - | `mailto:あなたのメールアドレス` |

> 実際のsecretは `.env.local` に置き、コミットしないでください(`.gitignore` 済み)。

### Googleカレンダー連携のセットアップ(任意)

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成し、**Google Calendar API** を有効化
2. **APIs & Services > Credentials** で OAuth 2.0 クライアントID(Webアプリ)を作成
3. Authorized redirect URI に `{NEXT_PUBLIC_APP_URL}/api/google/callback`(ローカルなら `http://localhost:3000/api/google/callback`)を追加
4. クライアントID/シークレットを `.env.local` に設定し、`TOKEN_ENCRYPTION_KEY` も設定
5. アプリの **設定 > Googleカレンダー連携** から接続

トークンはAES-256-GCMでサーバー側暗号化してからDBに保存されるため、ブラウザから自分の行を読めても資格情報は取得できません。

### 5. 起動

```bash
npm run dev
```

http://localhost:3000 を開き、アカウント作成 → ログインしてください。

> メール確認が有効な場合、確認メールのリンクを開いてからログインしてください。開発中は Supabaseダッシュボードの **Authentication > Providers > Email** で "Confirm email" をオフにすると即ログインできます。

## MVPの実装範囲

- Supabase Auth によるログイン(メール+パスワード)
- タスクCRUD(`next_action` / `recovery_action` 付き)
- 朝チェックイン(エネルギー・気分・重点領域・モード、1日1件)
- AI日次計画生成(`POST /api/daily-plan/generate`、Zod検証後に `daily_plans` へ保存)
- 今日画面(最低ライン / 標準ライン / 余裕ライン / If-Thenプラン / メンターコメント)
- 夜レビュー(最低ライン達成・スコア・失敗理由・ふりかえり、1日1件)
- Recovery Mode判定(2日連続未達 / 2日連続レビュー未入力 / 未完了10件以上)
- AI提案へのフィードバック(`feedback_events`)
- 学習処理(`/api/learning/update-patterns`, `/api/learning/update-skills`)
- 学習内容の確認・削除・無効化(`/settings/memory`)
- AIメンター簡易チャット(`/mentor`)
- 全テーブルRLS有効のSQL migration

### Phase 2 で追加された機能

- **Googleカレンダー連携**: OAuth接続、今日の予定取得(トークンは暗号化保存)
- **空き時間検出**: 予定の隙間(7:00〜23:00、15分以上)を自動検出し、今日画面に表示・計画生成プロンプトにも反映
- **作業ブロック登録**: 空き時間を選んで、計画のタスクをカレンダーに `🌱` 付きイベントとして登録
- **Webプッシュ通知**: VAPIDベースの購読管理(`/settings` でオン/オフ・テスト送信)
- **PWA / オフライン対応**: Service Workerによるオフラインフォールバック(`/offline`)・静的アセットキャッシュ・カスタムインストール促進UI(Chromium系はワンタップ、iOSは手順表示)
- **pgvector長期記憶検索**: `user_memories` に埋め込み(text-embedding-3-small)を付与し、メンターチャットで発言内容に関連する記憶をベクトル検索して文脈に反映
- **AIタスク自動分解**: タスク詳細画面から2〜6ステップに分解を提案(Zod検証済み)。**ユーザーが承認するまでDBに保存されない**。承認後はサブタスク(`parent_task_id`)として保存され、分解へのフィードバックも学習に使われる

### Phase 3: 文書ベースのタスクワークフローとテキスト出力

「粗いメモ → 実行可能なタスク → 1日の実行計画 → 計測 → 振り返り」という流れを、AI任せにせずユーザー承認を挟みながら回せます。

1. **文書からタスク取り込み**(`/tasks/import`): S/A/Bランク表などの粗いテキストを貼り付けると、AIが実行可能な粒度のタスク候補に分解。**編集・選択して承認したものだけ**が保存される
2. **タスクの精緻化**: タスク詳細のAI分解(`parent_task_id`)で、大きいタスクをさらに小さいステップへ
3. **1日の実行計画**: 計画生成は**登録済みタスクだけ**から S(最低)/A(標準)/B(余裕)を組み、時刻つきの目標スケジュール(`schedule_json`。食事・移動などの生活ブロック含む)も生成
4. **リアルタイム計測**: タスク一覧の ▶/⏹ でタスクの実測時間を記録(`time_entries`)。ご飯・移動・休憩は今日画面のクイックボタンから。実行中は経過分を表示
5. **テキスト出力**: 今日画面の「1日の予定(朝)をコピー」とレビュー画面の「振り返りをコピー」で、次のフォーマットのテキストをクリップボードにコピーできる

```
【5月26日 目標】
目標タスク
S：ポスター修正(4h),富士通 ES(1h)
A：日立 ES(1h)
B：アクセンチュア ES(1h)

目標スケジュール
09:00 - 10:00 移動
10:00 - 12:00 ポスター修正
...

【5月26日 実際】
タスク完了状況
S：...
実際のスケジュール（リアルタイム計測）
11:33 - 13:56 ポスター修正（143分）
19:05 - 実行中 受験校アプリ（経過59分）

振り返り
・タスク達成率 50%
・理由
疲れていた
・改善点
夜は軽いタスクにする
```

## 生活リズム学習機能

使うほどにアプリがあなたの生活リズムを学習します。データはすべて自分の行動ログとフィードバック由来で、`/settings/memory` からいつでも確認・削除できます。

| テーブル | 内容 | 例 |
| --- | --- | --- |
| `user_memories` | 自然文の記憶(確度・観測回数つき) | 「夜に重いタスクを置くと失敗しやすい」 |
| `lifestyle_patterns` | 統計的な傾向 | `minimum_plan_completion_rate = 0.72` |
| `agent_skills` | メンターの振る舞いルール | 「夜は5〜15分の軽いタスクを中心にする」 |

- **update-patterns**: 夜レビュー保存時に呼ばれ、最低ライン達成率・Recovery Mode成功率・失敗理由の頻度・時間帯別成功率(MVPでは `completed_at` ベースの簡易版。Calendar連携後に精緻化予定)を再計算します。
- **フィードバック → 記憶**: 同種のフィードバックが繰り返されたときだけ `user_memories` に昇格します(1回で確信しない)。
- 日次計画生成時には、これらすべてがプロンプトに反映されます。

## agent_skills の考え方

OpenClawのSkill管理、Hermes Agentの「実行結果からのSkill改善」の思想を、**DB上の軽量な仕組み**として実装しています(エージェント基盤そのものは導入していません)。

- Skillは `planning_skill` / `recovery_skill` / `task_breakdown_skill` / `mentor_tone_skill` / `review_skill` の5種類
- `POST /api/learning/update-skills` が直近のフィードバックを分析し、必要なら小さくルールを追加・更新
- 更新は必ず **versionを上げて新しい行を追加** し、旧ルールは削除せず `is_active = false` で履歴を残す
- **安全装置**:
  - AIの出力はZodで検証してからのみ保存
  - 「ユーザーを責める」「睡眠を削る」「未完了を罰する」「シェル実行」などの危険パターンはサーバー側の安全性チェック(`isRuleTextSafe`)で拒否
  - 1回の更新は最大3件まで
  - ユーザーは `/settings/memory` からいつでも確認・無効化・削除できる

## 画面一覧

| パス | 内容 |
| --- | --- |
| `/` | 未ログイン時は説明とログイン導線、ログイン済みなら `/today` へ |
| `/login` | ログイン / アカウント作成 |
| `/today` | 中心画面。計画表示・生成・フィードバック |
| `/tasks`, `/tasks/new`, `/tasks/[id]` | タスク一覧(計測▶/⏹つき)・作成・編集 |
| `/tasks/import` | 文書・メモからのタスク一括取り込み |
| `/checkin` | 朝チェックイン |
| `/review` | 夜レビュー |
| `/mentor` | AIメンター簡易チャット |
| `/settings`, `/settings/memory` | 設定・学習内容の確認と削除 |

## セキュリティ

- OpenAI API keyはサーバーサイドのみで使用
- Supabase service role keyは使用していない(全操作はユーザーJWT+RLS経由)
- 全テーブルで `user_id = auth.uid()` のRLSポリシーを適用
- AI出力はZodで検証してから保存(自由文で直接DBを更新しない)

## 後続Issue(未実装)

- [ ] 定時リマインダー通知(朝チェックイン・夜レビューのcron配信。Vercel Cron / Supabase Scheduled Functions + service role が必要)
- [ ] 時間帯別成功率の精緻化(Calendarの作業ブロック実績 vs 完了状況の突合)
- [ ] Sentry導入
- [ ] PostHog導入
- [ ] モバイルアプリ化

### 実装済み(Phase 2)

- [x] Google Calendar連携
- [x] 空き時間検出
- [x] Calendarへの作業ブロック登録
- [x] Web Push通知(購読・テスト送信)
- [x] PWA install UX改善(service worker / オフライン対応)
- [x] pgvectorによる長期記憶検索
- [x] AIによるタスク自動分解の高度化
