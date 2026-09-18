/**
 * ユーザー管理API
 * GET /api/admin/users - ユーザー一覧を取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/admin-jwt';
import { findAdminById } from '@/lib/admin-firestore';
import { getUsers, getUserStats } from '@/lib/admin-users';

/**
 * GET /api/admin/users
 * ユーザー一覧を取得（管理者・スーパー管理者のみ）
 */
export async function GET(req: NextRequest) {
    try {
        // 認証チェック
        const authHeader = req.headers.get('authorization');
        if (!authHeader) {
            return NextResponse.json(
                { success: false, error: '認証が必要です' },
                { status: 401 }
            );
        }

        const decoded = verifyToken(authHeader.replace('Bearer ', ''));
        if (!decoded) {
            return NextResponse.json(
                { success: false, error: '無効なトークンです' },
                { status: 401 }
            );
        }

        // 管理者存在チェック
        const admin = await findAdminById(decoded.adminId);
        if (!admin || !admin.isActive) {
            return NextResponse.json(
                { success: false, error: '管理者が見つかりません' },
                { status: 404 }
            );
        }

        // モデレーターはアクセス不可
        if (admin.role === 'moderator') {
            return NextResponse.json(
                { success: false, error: 'アクセス権限がありません' },
                { status: 403 }
            );
        }

        // クエリパラメータ
        const { searchParams } = new URL(req.url);
        const limit = parseInt(searchParams.get('limit') || '25');
        const offset = parseInt(searchParams.get('offset') || '0');
        const searchQuery = searchParams.get('search') || undefined;
        const includeStats = searchParams.get('stats') === 'true';

        // ユーザー一覧を取得
        const { users, total } = await getUsers(limit, offset, searchQuery);

        // createdAt / lastLoginAt は ISO 文字列として保存されているためそのまま返す
        const usersResponse = users.map((user) => ({ ...user }));

        const response: any = {
            success: true,
            users: usersResponse,
            total,
            limit,
            offset,
        };

        // 統計情報を含める場合
        if (includeStats) {
            const stats = await getUserStats();
            response.stats = stats;
        }

        return NextResponse.json(response);
    } catch (error) {
        console.error('[Admin Users API] GET error:', error);
        return NextResponse.json(
            { success: false, error: 'ユーザー一覧の取得に失敗しました' },
            { status: 500 }
        );
    }
}
