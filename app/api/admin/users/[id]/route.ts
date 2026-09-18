/**
 * ユーザー詳細API
 * GET /api/admin/users/[id] - ユーザー詳細を取得
 * PATCH /api/admin/users/[id] - ユーザー情報を更新
 * DELETE /api/admin/users/[id] - ユーザーを削除（管理者・スーパー管理者のみ）
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/admin-jwt';
import { findAdminById, recordAuditLog } from '@/lib/admin-firestore';
import { getUserById, deleteUser, getUserLogs } from '@/lib/admin-users';

/**
 * GET /api/admin/users/[id]
 * ユーザー詳細を取得
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
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

        const { id } = await params;

        // ユーザーを取得
        const user = await getUserById(id);
        if (!user) {
            return NextResponse.json(
                { success: false, error: 'ユーザーが見つかりません' },
                { status: 404 }
            );
        }

        // 最近の散歩記録を取得
        const recentLogs = await getUserLogs(id, 10);

        // createdAt / lastLoginAt は ISO 文字列として保存されているためそのまま使用
        const userResponse = { ...user };

        const convertTs = (ts: any): string | null => {
            if (!ts) return null;
            if (typeof ts === 'string') return ts;
            if (ts.toDate) return ts.toDate().toISOString();
            return null;
        };

        const logsResponse = recentLogs.map((log) => ({
            ...log,
            createdAt: convertTs(log.createdAt),
        }));

        return NextResponse.json({
            success: true,
            user: userResponse,
            recentLogs: logsResponse,
        });
    } catch (error) {
        console.error('[Admin Users API] GET error:', error);
        return NextResponse.json(
            { success: false, error: 'ユーザー詳細の取得に失敗しました' },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/admin/users/[id]
 * ユーザー情報を更新
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
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

        const { id } = await params;

        // ユーザーの存在確認
        const user = await getUserById(id);
        if (!user) {
            return NextResponse.json(
                { success: false, error: 'ユーザーが見つかりません' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            message: 'ユーザー情報を更新しました',
        });
    } catch (error) {
        console.error('[Admin Users API] PATCH error:', error);
        return NextResponse.json(
            { success: false, error: 'ユーザー情報の更新に失敗しました' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/admin/users/[id]
 * ユーザーを削除（管理者・スーパー管理者のみ）
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
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

        // 管理者・スーパー管理者のみ
        if (admin.role !== 'admin' && admin.role !== 'superadmin') {
            return NextResponse.json(
                { success: false, error: 'アクセス権限がありません' },
                { status: 403 }
            );
        }

        const { id } = await params;

        // ユーザーの存在確認
        const user = await getUserById(id);
        if (!user) {
            return NextResponse.json(
                { success: false, error: 'ユーザーが見つかりません' },
                { status: 404 }
            );
        }

        // ユーザーを削除
        await deleteUser(id);

        // 監査ログ記録
        await recordAuditLog(
            admin.adminId,
            'delete',
            'user',
            id,
            {
                before: { userId: user.userId },
                after: null,
            },
            req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
            req.headers.get('user-agent') || 'unknown'
        );

        return NextResponse.json({
            success: true,
            message: 'ユーザーを削除しました',
        });
    } catch (error) {
        console.error('[Admin Users API] DELETE error:', error);
        return NextResponse.json(
            { success: false, error: 'ユーザーの削除に失敗しました' },
            { status: 500 }
        );
    }
}
