# みちくさメモリー パフォーマンス改善記録

作成日: 2026-09-18

---

## 対応済み（2026-09-18）

### 1. 画像圧縮のメモリ使用量削減

**対象ファイル**: `lib/imageCompression.ts`

#### 変更前の問題

`compressImage()` が `FileReader.readAsDataURL` で画像を読み込んでいた。

```
元ファイル 10MB
  └─ readAsDataURL → base64文字列 ≒ 13MB（33%増）
       └─ img.src = base64 → ブラウザが展開 ≒ 48MB（12MP無圧縮ビットマップ）
            └─ Canvas 1024×1024 ≒ 4MB
                 └─ toBlob → 結果 ~300KB
```

ピーク時 **60〜70MB** を消費。モバイルの Chrome では複数タブ使用時やメモリの少ない端末で `canvas.toBlob()` が `null` を返す（→「画像の圧縮に失敗しました」エラー）かタブがクラッシュしていた。

加えて、サイズ超過時の再試行で元ファイルを毎回 `readAsDataURL` し直す再帰構造のため、GC が追いつかない場合にメモリが積み上がる問題もあった。

EXIF の Orientation タグも無視していたため、スマホで縦向きに撮った写真が横向きのまま保存されることがあった。

#### 変更後

`createImageBitmap(file, { imageOrientation: 'from-image' })` に置き換え。

```
元ファイル 10MB
  └─ createImageBitmap → 内部デコード（base64変換なし）
       └─ Canvas 1024×1024 ≒ 4MB（EXIF回転済み）
            └─ toBlob ループ（品質を 0.8→0.7→… と下げながら再デコードなしで試行）
                 └─ 結果 ~300KB
```

ピーク時 **約10MB** に削減。再試行時も元ファイルを再デコードしないためメモリが積み上がらない。EXIF 回転も自動補正。

**対応ブラウザ**: Chrome 54+, Safari iOS 15+, Firefox 98+（グローバルカバレッジ 約96.5%）

---

### 2. アルバム画像の遅延読み込み

**対象ファイル**: `app/album/page.tsx`

#### 変更前の問題

`<img>` タグで Cloudinary 画像を直接表示していた。

- 画面外の画像（スクロール先）も初期ロード時にまとめて取得
- Next.js の最適化パイプラインを通らない
- ブラウザの `loading="lazy"` が自動付与されない

#### 変更後

`next/image` の `<Image>` コンポーネントに変更。

- デフォルトで遅延読み込みが有効（画面内に入ったときだけ取得）
- Cloudinary 側がすでに WebP 配信しているため `unoptimized` で Next.js の再変換をスキップ
- `imageData`（base64、旧形式のログ）は `<img>` のまま維持（`next/image` は data URL 非対応）

---

### 3. 位置情報の API 呼び出し削減

**対象ファイル**: `app/oracle/page.tsx`

#### 変更前の問題

`generateNewMission()` が毎回 `getLocationInfo()` を呼び出していた。

```
ミッション生成のたびに:
  1. navigator.geolocation.getCurrentPosition（ブラウザ許可ダイアログ・GPS取得）
  2. /api/geocode 経由で Nominatim API（OSM の外部サーバー）へリクエスト
```

「別のミッションを受ける」を押すたびに毎回この処理が走り、Nominatim の利用規約（大量リクエスト禁止）にも抵触するリスクがあった。

#### 変更後

`sessionStorage` に 15 分間キャッシュ。

```
初回: GPS取得 + Nominatim API → sessionStorage に保存
2回目以降（15分以内）: sessionStorage から即座に取得（API呼び出しなし）
15分経過後: 再取得してキャッシュ更新
```

タブを閉じると自動でキャッシュが消えるため、`localStorage` より適切。

---

### 4. タイマーの不要な再レンダリング削減

**対象ファイル**: `app/oracle/page.tsx`

#### 変更前の問題

「行動中」画面の経過時間タイマーが 1 秒ごとに state を更新していた。

```ts
setInterval(() => { ... }, 1000);  // 1秒ごとに React の再レンダリングを発火
```

表示は「◯分」単位のみで、秒単位の更新に意味がなかった。

#### 変更後

```ts
setInterval(() => { ... }, 60000);  // 60秒ごとに変更
```

行動中のバックグラウンド処理が毎分 1 回に削減。

---

## 未対応・検討中

### A. album ページのページネーション

現状、すべてのログを Firestore から一括取得している（`getLogsFromFirestore`）。ログが 100 件を超えると初期読み込みが遅くなる。

**推奨対応**: Firestore の `limit()` + カーソルベースのページネーション（例: 20 件ずつ）。`startAfter(lastDoc)` で次ページを取得する方式。

### B. exifr のコード分割（遅延ロード）

`lib/imageMetadata.ts` が `exifr`（npm, 約1MB）を静的インポートしており、`record` ページのバンドルサイズ（32kB→ビルド時 First Load JS: 142kB）に影響している。

**推奨対応**: `dynamic import` で撮影時のみ読み込む。

```ts
// lib/imageMetadata.ts
const exifr = await import('exifr');
const data = await exifr.parse(file, { ... });
```

### C. ミッションの投機的プリフェッチ

ホーム画面（`/`）からミッション画面（`/oracle`）に遷移するとき、AI 生成に 1〜2 秒かかる。ホーム画面の表示中に裏で `/api/ai/mission` を叩いておけば、遷移後すぐに表示できる。

**推奨対応**: `next/link` の `prefetch` に加え、ホーム画面の `useEffect` 内でミッションを先読みして `sessionStorage` に保存。`/oracle` 側でキャッシュがあれば即表示、なければ通常フロー。

### D. Service Worker キャッシュ戦略の見直し

現在の `public/sw.js` は基本的なオフライン対応のみ。静的アセット（CSS/JS/フォント）を Cache First、API レスポンスを Network First + オフラインフォールバックに分けた戦略にすることで、再訪問時の速度が向上する。
