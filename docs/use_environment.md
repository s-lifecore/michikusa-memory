# みちくさメモリー 動作環境・依存関係まとめ

作成日: 2026-09-18

---

## 1. 推奨ブラウザ

| ブラウザ | 最低バージョン | 備考 |
|---|---|---|
| Chrome (Android) | 109+ | メイン動作確認対象 |
| Safari (iOS) | 17+ | 基本機能は 15+ でも動作 |
| Chrome (desktop) | 109+ | 開発・確認用 |
| Firefox | 98+ | 動作確認済み |
| Samsung Internet | 21+ | Android サブブラウザ |

> iOS では Chrome・Firefox も内部エンジンが WebKit のため、Safari と同等の制約を受ける。

---

## 2. 使用しているブラウザ API と対応状況

### カメラ・画像

| API | 用途 | Chrome | Safari iOS | 備考 |
|---|---|---|---|---|
| `<input capture="environment">` | カメラ起動 | ✅ 全バージョン | ✅ 全バージョン | ネイティブカメラアプリを呼び出す |
| `FileReader.readAsDataURL` | 圧縮前の画像読み込み | ✅ | ✅ | **現在使用中**。base64変換でメモリ33%増のデメリットあり |
| `HTMLCanvasElement.toBlob` | 圧縮後の Blob 生成 | ✅ 50+ | ✅ 11+ | 低メモリ時に `null` を返すことがある（→「圧縮失敗」エラーの原因） |
| `createImageBitmap` + `resizeWidth` | 圧縮の効率的な代替 | ✅ 54+ | ✅ **15+** | **未使用・移行候補**。EXIF回転自動補正も可能 |
| `URL.createObjectURL` | プレビュー用 Blob URL | ✅ | ✅ | 使用済み（`revokeObjectURL` で解放） |
| `exifr`（npm）| EXIF メタデータ取得 | ✅ | ✅ | lib/imageMetadata.ts で使用 |

**現状の問題**: `FileReader.readAsDataURL` → Canvas という圧縮フローは、12MP写真で一時的に 60〜70MB のメモリを消費する。モバイル Chrome でタブがクラッシュしたり `toBlob` が `null` を返す原因になりうる。`createImageBitmap` への移行が推奨（iOS 15+ / Chrome 54+ でカバレッジ約96.5%）。

---

### 位置情報

| API | 用途 | Chrome | Safari iOS | 備考 |
|---|---|---|---|---|
| `navigator.geolocation.getCurrentPosition` | 現在地取得 | ✅ | ✅ | HTTPS 必須。ユーザー許可が必要 |
| Nominatim API（外部）| 逆ジオコーディング | — | — | OSM 無料API。`/api/geocode` 経由でプロキシ |
| `Intl.DateTimeFormat` | タイムゾーン取得 | ✅ | ✅ | ブラウザ標準。外部API不要 |

---

### ストレージ

| API | 用途 | Chrome | Safari iOS | 備考 |
|---|---|---|---|---|
| `localStorage` | userId・ログキャッシュ・セッション管理 | ✅ | ✅ | Safari のプライベートブラウズでは容量制限 (5MB) に注意 |
| Firestore Web SDK | ユーザーデータ永続化 | ✅ | ✅ | Firebase Anonymous Auth + Custom Claims で保護 |

---

### PWA・通知

| API | 用途 | Chrome | Safari iOS | 備考 |
|---|---|---|---|---|
| Service Worker | オフラインキャッシュ | ✅ 40+ | ✅ **16.4+** | iOS 15 以下では Service Worker が不安定 |
| Web App Manifest | ホーム画面追加 | ✅ | ✅ | `display: minimal-ui` |
| Push API / Web Push | プッシュ通知 | ✅ | ✅ **16.4+** | iOS 16.4 未満は非対応。現在アプリ内通知のみ実装 |

---

## 3. 外部サービス依存関係

| サービス | 用途 | 無料枠 / 料金 | 障害時の挙動 |
|---|---|---|---|
| **Firebase Firestore** | ユーザーデータ・ログ保存 | Spark プラン（無料） | 書き込み失敗。localStorage キャッシュは残る |
| **Firebase Auth** | 匿名認証・Custom Claims | 無料 | ログイン・Firestore アクセス不可 |
| **Cloudinary** | 画像アップロード・配信 | 無料枠 25GB | 画像なしでログ保存は継続可能 |
| **Gemini API** | AIミッション生成 | 従量課金（gemini-1.5-flash） | フォールバックミッション（`data/fallbackMissions.ts`）に自動切替 |
| **Nominatim (OSM)** | 逆ジオコーディング | 無料（利用規約あり） | 位置情報なしでミッション生成にフォールバック |

> Nominatim の利用規約では大量リクエストは禁止。1ユーザー1ミッション生成時に1回のみ呼び出しのため問題なし。

---

## 4. 技術スタック

| カテゴリ | ライブラリ / ツール | バージョン |
|---|---|---|
| フレームワーク | Next.js | 15.5.11 |
| UI | React / React DOM | 19.2.4 |
| 言語 | TypeScript | 5.6.0 |
| 認証・DB | Firebase SDK (client) | 11.0.1 |
| 認証・DB | Firebase Admin SDK (server) | 13.0.2 |
| 画像配信 | Cloudinary SDK | 2.9.0 |
| AI | @google/generative-ai | 0.21.0 |
| EXIF解析 | exifr | 7.1.3 |
| パスワードハッシュ | bcryptjs | 3.0.3 |
| PWA | next-pwa | 5.6.0 |
| バンドラ | webpack | 5.90.0 |
| **ランタイム** | **Node.js** | **20.x (LTS)** |

---

## 5. 既知の制限・注意事項

### モバイル Chrome（Android）
- 低メモリ端末では画像圧縮中にタブがクラッシュする可能性がある（12MP以上の写真で顕著）
- 原因: `FileReader.readAsDataURL` による base64 変換 + Canvas 展開でピーク時 60〜70MB を消費
- 対策予定: `createImageBitmap` への移行（`improvements.md` 参照）

### Safari（iOS 15 以下）
- Service Worker の動作が不安定なためオフライン同期が機能しない場合がある
- Push 通知は非対応（iOS 16.4+ から対応）

### Safari プライベートブラウズ
- localStorage の容量が制限される（一部機能が動作しない可能性）
- IndexedDB も制限対象

### HTTPS 必須
- カメラ（`<input capture>`）、位置情報（`navigator.geolocation`）、Service Worker はすべて HTTPS 環境でのみ動作
- ローカル開発は `localhost` で代替可

### Cloudinary 未設定時
- 環境変数 `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` / `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` が未設定の場合、画像なしでログ保存は可能（imageUrl が空になる）

---

## 6. 環境変数一覧

| 変数名 | 種別 | 必須 | 用途 |
|---|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | public | ✅ | Firebase クライアント |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | public | ✅ | Firebase クライアント |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | public | ✅ | Firebase クライアント |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | public | ✅ | Firebase クライアント |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | public | ✅ | Firebase クライアント |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | public | ✅ | Firebase クライアント |
| `FIREBASE_ADMIN_PROJECT_ID` | secret | ✅ | Firebase Admin SDK |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | secret | ✅ | Firebase Admin SDK |
| `FIREBASE_ADMIN_PRIVATE_KEY` | secret | ✅ | Firebase Admin SDK |
| `ADMIN_JWT_SECRET` | secret | ✅ | 管理者JWT署名（未設定時はサーバー起動失敗） |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | public | △ | 画像アップロード（未設定時は画像なし動作） |
| `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | public | △ | 画像アップロード |
| `NEXT_PUBLIC_CLOUDINARY_API_KEY` | public | △ | 画像アップロード |
| `AI_PROVIDER_API_KEY` | secret | △ | Gemini API（未設定時はフォールバックミッション） |
| `GEMINI_API_KEY` | secret | △ | Gemini API（↑の代替） |
| `GEMINI_MODEL` | — | — | 使用モデル名（デフォルト: `gemini-1.5-flash-latest`） |
