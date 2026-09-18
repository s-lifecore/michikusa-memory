import jwt from 'jsonwebtoken';

/**
 * JWT ペイロードの型定義
 */
export interface AdminJWTPayload {
  adminId: string;
  email: string;
  role: 'superadmin' | 'admin' | 'moderator';
  iat?: number;
  exp?: number;
}

function getJwtSecret(): string {
    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret) {
        throw new Error('ADMIN_JWT_SECRET 環境変数が設定されていません。本番環境では必ず設定してください。');
    }
    return secret;
}

/**
 * トークンの有効期限（秒）: 8時間
 */
const TOKEN_EXPIRY = 8 * 60 * 60;

/**
 * JWT トークンを生成
 * @param payload - JWT ペイロード
 * @returns トークン
 */
export function generateToken(payload: Omit<AdminJWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: TOKEN_EXPIRY,
  });
}

/**
 * JWT トークンを検証・デコード
 * @param token - JWT トークン
 * @returns デコード済みペイロード、またはエラーの場合は null
 */
export function verifyToken(token: string): AdminJWTPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AdminJWTPayload;
    return decoded;
  } catch (error) {
    console.error('[JWT] Token verification failed:', error);
    return null;
  }
}

/**
 * JWT トークンをデコード（署名検証なし）
 * @param token - JWT トークン
 * @returns デコード済みペイロード、またはエラーの場合は null
 */
export function decodeToken(token: string): AdminJWTPayload | null {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || typeof decoded !== 'object') {
      return null;
    }
    return decoded as AdminJWTPayload;
  } catch (error) {
    console.error('[JWT] Token decode failed:', error);
    return null;
  }
}

/**
 * Authorization ヘッダーからトークンを抽出
 * @param authHeader - Authorization ヘッダー値
 * @returns トークン、またはない場合は null
 */
export function extractTokenFromHeader(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null;
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }
  
  return parts[1];
}

/**
 * localStorage から トークンを取得（クライアント側用）
 * @returns トークン、またはない場合は null
 */
export function getTokenFromStorage(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('admin_token');
}

/**
 * localStorage にトークンを保存（クライアント側用）
 * @param token - JWT トークン
 */
export function saveTokenToStorage(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('admin_token', token);
}

/**
 * localStorage からトークンを削除（ログアウト用）
 */
export function removeTokenFromStorage(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('admin_token');
}

/**
 * トークンの有効期限を取得
 * @param token - JWT トークン
 * @returns 有効期限（ミリ秒）、またはエラーの場合は null
 */
export function getTokenExpiry(token: string): number | null {
  const payload = typeof window === 'undefined' ? verifyToken(token) : decodeToken(token);
  if (!payload || !payload.exp) return null;
  return payload.exp * 1000; // 秒をミリ秒に変換
}

/**
 * トークンが期限切れかどうか判定
 * @param token - JWT トークン
 * @returns true: 期限切れ、false: 有効
 */
export function isTokenExpired(token: string): boolean {
  const expiry = getTokenExpiry(token);
  if (!expiry) return true;
  return Date.now() > expiry;
}
