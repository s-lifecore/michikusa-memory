# みちくさメモリー（michikusa_memory）改善点

調査日: 2026-09-18
最終更新: 2026-09-18（コード修正済み項目を反映）

対象: 本リポジトリのソースコード（`app/`, `lib/`, `firestore.rules`, `next.config.ts` 等）を直接確認して洗い出した課題。
`non-public/SECURITY_REVIEW.md` に記載済みの既知課題とは重複しないよう、**コード確認で新たに見つかったもの**を中心にまとめている。

---

## ✅ 対応済み

### 1. Firestoreセキュリティルールが「本人」を判定していない ✅

**対応内容（2026-09-18）**:
カスタムクレーム（Custom Claims）方式で実装。

- `app/api/auth/login/route.ts` / `app/api/auth/signup/route.ts`: 認証成功時に Firebase Admin SDK の `setCustomUserClaims(firebaseUid, { userId })` でトークンへ `userId` を埋め込む
- `app/setup/page.tsx`: ログイン・サインアップ時に Firebase 匿名 UID をリクエストに含め、成功後に `getIdToken(true)` でトークンを強制リフレッシュ
- `lib/firebase.ts`: `getCurrentFirebaseUid()`, `refreshAuthToken()`, `hasUserIdClaim()` を追加
- `lib/firebase-admin.ts`: `getAdminAuth()` を追加
- `app/album/page.tsx` / `app/mypage/page.tsx`: ページ読み込み時にクレームを確認し、未取得（既存セッション）の場合は `/setup` へリダイレクト
- `firestore.rules`: `request.auth != null` → `request.auth.token.userId == userId` に変更

**残課題**: パスワードリセット機能（`handlePasswordReset`）が localStorage のハッシュを更新するのみで Firestore の `passwordHash` を更新していないため、リセット後にサーバー側ログインが旧パスワードのままになるバグが存在する（後述 #11）。

---

### 2. 管理者JWTのシークレットにハードコードされたデフォルト値がある ✅

**対応内容（2026-09-18）**:
`lib/admin-jwt.ts` の `JWT_SECRET` を即時評価から `getJwtSecret()` 関数に変更。`ADMIN_JWT_SECRET` 未設定時は `generateToken()` / `verifyToken()` の呼び出し時点でエラーをスローする（フェイルファスト）。

---

### 3. `/api/ai/mission` にレート制限がない ✅

**対応内容（2026-09-18）**:
`app/api/ai/mission/route.ts` に IP 単位のレート制限を追加。15 分ウィンドウで最大 10 リクエスト。超過時は 429 を返す。

---

### 4. マイページの「復元」フローが別端末では機能しない設計になっている ✅

**対応内容（2026-09-18）**:
`app/mypage/page.tsx` の `handleRestore` および `handlePasswordReset` において、localStorage のハッシュによるクライアント検証を廃止し、`/api/auth/login` 呼び出しによるサーバー側検証に変更。`verifyPassword` のインポートも削除。

---

### 5. Permissions-Policyのマイク許可設定が矛盾しており、かつ未使用機能 ✅

**対応内容（2026-09-18）**:
- `app/layout.tsx`: メタタグから `microphone=*` を削除（`camera=*` のみに）
- `public/manifest.json`: `"permissions"` から `"microphone"` を削除

---

### 6. Google Analytics挿入コードがページごとに重複している ✅

**対応内容（2026-09-18）**:
`app/mypage/page.tsx` から重複していた GA スクリプト（`<Script>` 2ブロック）を削除。`import Script` も併せて削除。

---

### 8. `calculateBrightness` に到達不能な分岐がある ✅

**対応内容（2026-09-18）**:
`lib/geolocation.ts` の最後の `return 'dark'`（全時刻が上の分岐で網羅されるため絶対到達しない）を削除。最後の `else if` を `else` に変更。

---

### 9. 開発環境でTLS証明書検証を無効化するコードが本番ビルドにも含まれている ✅

**対応内容（2026-09-18）**:
`app/api/ai/mission/route.ts` から `NODE_TLS_REJECT_UNAUTHORIZED = '0'` を設定するブロックを削除。プロセス全体に影響するグローバル変数への依存を廃止。

---

## 🟠 未対応（中程度）

### 7. クライアント側の「連続失敗ロック」はlocalStorage依存で回避が容易

`app/mypage/page.tsx` の復元試行カウント（3回失敗で60分ロック）は `localStorage` に保存されており、ブラウザのプライベートモードや `localStorage.clear()` で即座にリセットできる。Issue 1・4 が対応済みになり直接的なリスクは低減したが、ロック自体の効力は依然ない。

**推奨対応**: 復元フローをサーバー側 API に移し、IP/ユーザー単位のロックをサーバー側状態（Firestore 等）で管理する（ログイン API で既に採用している方式を流用できる）。

---

### 10. サービスアカウント鍵ファイルがリポジトリ直下に存在する

`reborn-e4c8d-firebase-adminsdk-fbsvc-bed32e5f21.json` が作業ディレクトリ直下に置かれている。`.gitignore` の `*firebase-adminsdk*.json` により追跡対象外にはなっており（確認済み、Git履歴にも一度もコミットされていない）現時点で漏えいはしていないが、リポジトリ直下に本番認証情報の実ファイルを置く運用は、`git add -f` や `.gitignore` の変更ミスといったヒューマンエラー一つで即座に鍵が漏えいするリスクを抱えている。

**推奨対応**: 鍵ファイルはリポジトリ外（例: `~/.secrets/`）に保管し、環境変数（`FIREBASE_ADMIN_PRIVATE_KEY` 等、`.env.sample` に用意されている方式）経由での読み込みに統一する。`lib/firebase-admin.ts` の JSON ファイルフォールバックを削除することが最終ゴール。

---

## 🟡 未対応（新規発見・軽微）

### 11. パスワードリセット機能が localStorage のみ更新しており Firestore と乖離する

`lib/password.ts:58-73` の `resetPassword()` は新しいハッシュを `localStorage` に保存するだけで、Firestore の `users/{userId}.passwordHash` を更新しない。結果として：

- リセット後に同じデバイスではログインできるが、別デバイス・ブラウザからは**旧パスワードが要求される**
- Issue 4 の修正でパスワード検証がサーバー側に移行したことで、リセット直後に自分のマイページ操作（バックアップ・復元）が即座に失敗するようになる矛盾が顕在化した

**推奨対応**:
1. `resetPassword()` 内または専用の `POST /api/auth/reset-password` エンドポイントで、新しいハッシュを Firestore にも書き込む
2. リセット成功後にセットアップページへ誘導し、新しいパスワードで再ログインを促す

---

## まとめ（更新版）

Issue 1〜6・8・9 の計8件を 2026-09-18 に修正済み。

**残存リスクの優先度**:
1. **Issue 11（パスワードリセットの Firestore 非更新）** — Issue 4 の修正により既存ユーザーへの影響が顕在化するため、早めの対応が望ましい
2. **Issue 10（鍵ファイルの保管場所）** — .gitignore で保護中だが運用リスクが残る。環境変数方式への完全移行を推奨
3. **Issue 7（復元ロックの localStorage 依存）** — Issue 1・4 対応後は実害が大幅に低減しているため優先度は低い
