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
- Supabase Auth / Supabase Postgres (RLS有効)
- OpenAI API
- Zod (AI出力の検証)
- スマホファーストUI(PWA manifest対応)

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

Supabaseダッシュボードの **SQL Editor** に `supabase/migrations/0001_init.sql` の内容を貼り付けて実行。

**方法B: Supabase CLI**

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

migrationには全テーブルの作成・RLSポリシー・サインアップ時にprofilesを自動作成するトリガーが含まれます。

### 4. 環境変数の設定

```bash
cp .env.example .env.local
```

`.env.local` を編集します。

| 変数 | 説明 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | SupabaseのProject URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabaseのanon public key |
| `OPENAI_API_KEY` | OpenAIのAPIキー([platform.openai.com](https://platform.openai.com/api-keys)で発行)。サーバーサイドのみで使用され、クライアントには出ません |
| `OPENAI_MODEL` | (任意)使用モデル。デフォルト `gpt-4o-mini` |

> 実際のsecretは `.env.local` に置き、コミットしないでください(`.gitignore` 済み)。

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
| `/tasks`, `/tasks/new`, `/tasks/[id]` | タスク一覧・作成・編集 |
| `/checkin` | 朝チェックイン |
| `/review` | 夜レビュー |
| `/mentor` | AIメンター簡易チャット |
| `/settings`, `/settings/memory` | 設定・学習内容の確認と削除 |

## セキュリティ

- OpenAI API keyはサーバーサイドのみで使用
- Supabase service role keyは使用していない(全操作はユーザーJWT+RLS経由)
- 全テーブルで `user_id = auth.uid()` のRLSポリシーを適用
- AI出力はZodで検証してから保存(自由文で直接DBを更新しない)

## 後続Issue(今回未実装)

- [ ] Google Calendar連携
- [ ] 空き時間検出
- [ ] Calendarへの作業ブロック登録
- [ ] Web Push通知
- [ ] PWA install UX改善(service worker / オフライン対応)
- [ ] Sentry導入
- [ ] PostHog導入
- [ ] pgvectorによる長期記憶検索
- [ ] AIによるタスク自動分解の高度化
- [ ] モバイルアプリ化
