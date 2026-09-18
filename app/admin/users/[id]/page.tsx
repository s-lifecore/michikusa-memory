'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { useAdminAuth, ProtectedAdminRoute } from '@/lib/admin-auth-context';
import { getTokenFromStorage } from '@/lib/admin-jwt';
import styles from '../users.module.css';

interface UserDetail {
    userId: string;
    createdAt: string;
    lastLoginAt: string | null;
    totalAdventures: number;
    profileImageUrl?: string | null;
}

interface Log {
    logId: string;
    missionText?: string;
    memo?: string;
    status?: string;
    createdAt: string | null;
}

export default function UserDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const { admin, isLoading: authLoading } = useAdminAuth();
    const [user, setUser] = useState<UserDetail | null>(null);
    const [recentLogs, setRecentLogs] = useState<Log[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        if (authLoading || !admin || !id) return;

        const fetchUser = async () => {
            try {
                setIsLoading(true);
                const token = getTokenFromStorage();
                if (!token) { setError('認証トークンがありません'); return; }

                const res = await fetch(`/api/admin/users/${id}`, {
                    headers: { Authorization: `Bearer ${token}` },
                    cache: 'no-store',
                });

                if (res.status === 404) {
                    router.replace('/admin/users');
                    return;
                }

                if (!res.ok) {
                    const data = await res.json();
                    setError(data.error || 'ユーザーの取得に失敗しました');
                    return;
                }

                const data = await res.json();
                setUser(data.user);
                setRecentLogs(data.recentLogs ?? []);
            } catch {
                setError('ユーザー詳細の取得中にエラーが発生しました');
            } finally {
                setIsLoading(false);
            }
        };

        fetchUser();
    }, [admin, authLoading, id]);

    const handleDelete = async () => {
        if (!confirm(`ユーザー「${id}」を削除しますか？この操作は取り消せません。`)) return;

        try {
            setIsDeleting(true);
            const token = getTokenFromStorage();
            const res = await fetch(`/api/admin/users/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!res.ok) {
                const data = await res.json();
                alert(data.error || '削除に失敗しました');
                return;
            }

            router.push('/admin/users');
            router.refresh();
        } catch {
            alert('削除中にエラーが発生しました');
        } finally {
            setIsDeleting(false);
        }
    };

    const formatDate = (dateString: string | null) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleString('ja-JP', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
        });
    };

    if (authLoading || isLoading) {
        return (
            <div className={styles.loading}>
                <div className={styles.spinner} />
            </div>
        );
    }

    if (error || !user) {
        return (
            <ProtectedAdminRoute>
                <div className={styles.usersContainer}>
                    <button className={styles.actionButton} onClick={() => { router.push('/admin/users'); router.refresh(); }}>← 一覧に戻る</button>
                    <div className={styles.errorMessage}>{error || 'ユーザーが見つかりません'}</div>
                </div>
            </ProtectedAdminRoute>
        );
    }

    return (
        <ProtectedAdminRoute>
            <div className={styles.usersContainer}>
                <div className={styles.header}>
                    <div className={styles.headerTop}>
                        <h1 className={styles.title}>👤 {user.userId}</h1>
                        <button className={styles.actionButton} onClick={() => { router.push('/admin/users'); router.refresh(); }}>← 一覧に戻る</button>
                    </div>
                </div>

                {/* 基本情報 */}
                <div className={styles.statsGrid} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                    <div className={styles.statCard}>
                        <div className={styles.statLabel}>ユーザーID</div>
                        <div className={styles.statValue} style={{ fontSize: '1.1rem' }}>{user.userId}</div>
                    </div>
                    <div className={styles.statCard}>
                        <div className={styles.statLabel}>登録日</div>
                        <div className={styles.statValue} style={{ fontSize: '1rem' }}>{formatDate(user.createdAt)}</div>
                    </div>
                    <div className={styles.statCard}>
                        <div className={styles.statLabel}>最終ログイン</div>
                        <div className={styles.statValue} style={{ fontSize: '1rem' }}>{formatDate(user.lastLoginAt)}</div>
                    </div>
                    <div className={styles.statCard}>
                        <div className={styles.statLabel}>冒険回数</div>
                        <div className={styles.statValue}>{Number(user.totalAdventures ?? 0).toLocaleString()}回</div>
                    </div>
                </div>

                {/* 最近の冒険ログ */}
                <h2 style={{ marginTop: '2rem', marginBottom: '1rem', fontSize: '1.2rem', fontWeight: 600 }}>
                    最近の冒険ログ
                </h2>
                {recentLogs.length === 0 ? (
                    <p style={{ color: '#6b7280' }}>記録がありません</p>
                ) : (
                    <div className={styles.tableContainer}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>日時</th>
                                    <th>ミッション</th>
                                    <th>ステータス</th>
                                    <th>メモ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentLogs.map((log) => (
                                    <tr key={log.logId}>
                                        <td>{formatDate(log.createdAt)}</td>
                                        <td>{log.missionText ?? '-'}</td>
                                        <td>{log.status === 'cancelled' ? 'キャンセル' : '完了'}</td>
                                        <td>{log.memo ?? '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* 危険操作 */}
                {(admin?.role === 'admin' || admin?.role === 'superadmin') && (
                    <div style={{ marginTop: '3rem', padding: '1.5rem', border: '1px solid #fca5a5', borderRadius: '8px', background: '#fff5f5' }}>
                        <h3 style={{ color: '#dc2626', marginBottom: '0.75rem' }}>危険な操作</h3>
                        <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '1rem' }}>
                            ユーザーを削除すると、すべての冒険記録も削除されます。この操作は取り消せません。
                        </p>
                        <button
                            onClick={handleDelete}
                            disabled={isDeleting}
                            style={{
                                background: '#dc2626', color: 'white', border: 'none',
                                borderRadius: '6px', padding: '0.5rem 1rem', cursor: 'pointer',
                                opacity: isDeleting ? 0.6 : 1,
                            }}
                        >
                            {isDeleting ? '削除中...' : 'ユーザーを削除'}
                        </button>
                    </div>
                )}
            </div>
        </ProtectedAdminRoute>
    );
}
