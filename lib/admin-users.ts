/**
 * ユーザー管理関連のFirestore操作
 */

import { getAdminDb } from './admin-firestore';

const db = getAdminDb();

export interface User {
    userId: string;
    passwordHash?: string;
    createdAt: string;
    lastLoginAt: string | null;
    totalAdventures: number;
    profileImageUrl?: string | null;
}

export interface UserStats {
    totalUsers: number;
    activeUsers: number;
    newUsersToday: number;
    newUsersThisWeek: number;
    newUsersThisMonth: number;
}

/**
 * ユーザー一覧を取得（ページネーション付き）
 */
export async function getUsers(
    limit: number = 25,
    offset: number = 0,
    searchQuery?: string
): Promise<{ users: User[]; total: number }> {
    try {
        // createdAt は ISO 文字列なので辞書順で降順ソート可能
        let query = db.collection('users').orderBy('createdAt', 'desc') as FirebaseFirestore.Query;

        if (searchQuery) {
            // userId の前方一致検索（orderBy と where を同フィールドにしないため別クエリ）
            const searchSnapshot = await db.collection('users')
                .where('userId', '>=', searchQuery)
                .where('userId', '<=', searchQuery + '')
                .get();

            const users: User[] = [];
            searchSnapshot.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
                users.push({ userId: doc.id, ...doc.data() } as User);
            });
            return { users, total: users.length };
        }

        // 総数を取得
        const totalSnapshot = await query.get();
        const total = totalSnapshot.size;

        // ページネーション
        const snapshot = await query.limit(limit).offset(offset).get();

        const users: User[] = [];
        snapshot.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
            users.push({ userId: doc.id, ...doc.data() } as User);
        });

        return { users, total };
    } catch (error) {
        console.error('[Admin Users] Error getting users:', error);
        throw error;
    }
}

/**
 * ユーザーIDでユーザーを取得
 */
export async function getUserById(userId: string): Promise<User | null> {
    try {
        const doc = await db.collection('users').doc(userId).get();

        if (!doc.exists) {
            return null;
        }

        return { userId: doc.id, ...doc.data() } as User;
    } catch (error) {
        console.error('[Admin Users] Error getting user by ID:', error);
        throw error;
    }
}

/**
 * ユーザーを削除
 */
export async function deleteUser(userId: string): Promise<void> {
    try {
        const logsSnapshot = await db
            .collection('users')
            .doc(userId)
            .collection('logs')
            .get();

        const batch = db.batch();

        logsSnapshot.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
            batch.delete(doc.ref);
        });

        batch.delete(db.collection('users').doc(userId));

        await batch.commit();
    } catch (error) {
        console.error('[Admin Users] Error deleting user:', error);
        throw error;
    }
}

/**
 * ユーザー統計を取得
 */
export async function getUserStats(): Promise<UserStats> {
    try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(todayStart);
        weekStart.setDate(weekStart.getDate() - 7);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        // createdAt を持つドキュメントのみ対象（getUsers と同じ条件）
        const totalSnapshot = await db.collection('users').orderBy('createdAt').get();
        const totalUsers = totalSnapshot.size;

        const todaySnapshot = await db.collection('users')
            .where('createdAt', '>=', todayStart.toISOString())
            .get();
        const newUsersToday = todaySnapshot.size;

        const weekSnapshot = await db.collection('users')
            .where('createdAt', '>=', weekStart.toISOString())
            .get();
        const newUsersThisWeek = weekSnapshot.size;

        const monthSnapshot = await db.collection('users')
            .where('createdAt', '>=', monthStart.toISOString())
            .get();
        const newUsersThisMonth = monthSnapshot.size;

        return {
            totalUsers,
            activeUsers: totalUsers, // isActive フィールド未実装のため全件をアクティブとする
            newUsersToday,
            newUsersThisWeek,
            newUsersThisMonth,
        };
    } catch (error) {
        console.error('[Admin Users] Error getting user stats:', error);
        throw error;
    }
}

/**
 * ユーザーの散歩記録一覧を取得
 */
export async function getUserLogs(
    userId: string,
    limit: number = 10
): Promise<any[]> {
    try {
        const snapshot = await db
            .collection('users')
            .doc(userId)
            .collection('logs')
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();

        const logs: any[] = [];
        snapshot.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
            logs.push({ logId: doc.id, ...doc.data() });
        });

        return logs;
    } catch (error) {
        console.error('[Admin Users] Error getting user logs:', error);
        throw error;
    }
}
