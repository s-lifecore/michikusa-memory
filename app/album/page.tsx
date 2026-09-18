'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserLog } from '@/lib/types';
import { getLogsFromFirestore, deleteLogFromFirestore } from '@/lib/firestore';
import { getErrorMessage, showErrorNotification, showSuccessNotification, showConfirmModal } from '@/lib/errorHandler';
import Image from 'next/image';
import { getThumbnailUrl, getMediumUrl, isAllowedImageUrl } from '@/lib/cloudinary';
import { ensureAuthenticated, hasUserIdClaim } from '@/lib/firebase';
import styles from './album.module.css';

export default function AlbumPage() {
    const router = useRouter();
    const [userId, setUserId] = useState<string | null>(null);
    const [logs, setLogs] = useState<UserLog[]>([]);
    const [selectedLog, setSelectedLog] = useState<UserLog | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // ユーザーIDチェック
        const storedUserId = localStorage.getItem('reborn_userId');
        if (!storedUserId) {
            router.push('/setup');
            return;
        }
        setUserId(storedUserId);

        // Firebase匿名認証を確保してからFirestore取得
        const fetchLogs = async () => {
            setIsLoading(true);
            try {
                // 認証を確保
                await ensureAuthenticated();

                // カスタムクレームがない場合は再認証へ
                const hasClaim = await hasUserIdClaim(storedUserId);
                if (!hasClaim) {
                    router.push('/setup');
                    return;
                }

                const firestoreLogs = await getLogsFromFirestore(storedUserId);

                // 新しい順にソート
                const sortedLogs = firestoreLogs.sort((a, b) => {
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                });

                setLogs(sortedLogs);

                // localStorage にもキャッシュ（オフライン対応）
                try {
                    localStorage.setItem('michikusa_memory_logs', JSON.stringify(sortedLogs));
                } catch (storageError) {
                    console.warn('localStorage へのキャッシュに失敗しました:', storageError);
                }
            } catch (error) {
                console.error('ログの取得に失敗しました:', error);
                const message = getErrorMessage(error);
                showErrorNotification(`ログの読み込みに失敗しました: ${message}`);

                // オフライン時は localStorage からフォールバック
                try {
                    const logsString = localStorage.getItem('michikusa_memory_logs') || '[]';
                    const cachedLogs: UserLog[] = JSON.parse(logsString);
                    const sortedLogs = cachedLogs.sort((a, b) => {
                        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                    });
                    setLogs(sortedLogs);
                } catch (cacheError) {
                    console.error('キャッシュからの読み込みにも失敗しました:', cacheError);
                }
            } finally {
                setIsLoading(false);
            }
        };

        fetchLogs();
    }, [router]);

    const formatDate = (dateString: string | Date) => {
        const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
        return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
    };

    const formatTime = (dateString: string | Date) => {
        const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    };

    const handleDeleteLog = async (log: UserLog) => {
        if (!userId || !log.id) {
            showErrorNotification('削除できません（ログIDまたはユーザーIDが不明です）');
            return;
        }

        showConfirmModal(
            'この冒険の記録を削除しますか？\nこの操作は取り消せません。',
            async () => {
                try {
                    // Firestore から削除
                    await deleteLogFromFirestore(userId, log.id!);

                    // ローカルの状態を更新
                    const updatedLogs = logs.filter(l => l.id !== log.id);
                    setLogs(updatedLogs);

                    // localStorage も更新
                    try {
                        localStorage.setItem('reborn_logs', JSON.stringify(updatedLogs));
                    } catch (storageError) {
                        console.warn('localStorage の更新に失敗しました:', storageError);
                    }

                    // 詳細表示を閉じる
                    setSelectedLog(null);

                    showSuccessNotification('冒険の記録を削除しました');
                } catch (error) {
                    console.error('削除に失敗しました:', error);
                    const message = getErrorMessage(error);
                    showErrorNotification(`削除に失敗しました: ${message}`);
                }
            }
        );
    };

    if (!userId || isLoading) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>読み込み中...</div>
            </div>
        );
    }

    if (logs.length === 0) {
        return (
            <div className={styles.container}>
                <main className={styles.main}>
                    <h1 className={styles.header}>冒険の書</h1>
                    <div className={styles.emptyState}>
                        <p className={styles.emptyMessage}>まだ冒険の記録がありません</p>
                        <button
                            onClick={() => router.push('/')}
                            className={styles.primaryButton}
                        >
                            ミッションを受ける
                        </button>
                    </div>
                </main>
            </div>
        );
    }

    if (selectedLog) {
        return (
            <div className={styles.container}>
                <main className={styles.main}>
                    <button
                        onClick={() => setSelectedLog(null)}
                        className={styles.backButton}
                    >
                        ← 一覧に戻る
                    </button>

                    <div className={styles.detailCard}>
                        <div className={styles.detailDate}>
                            {formatDate(selectedLog.createdAt)} {formatTime(selectedLog.createdAt)}
                            {selectedLog.status === 'cancelled' && <span className={styles.cancelledBadge}>キャンセル</span>}
                        </div>

                        {((selectedLog.imageUrl && isAllowedImageUrl(selectedLog.imageUrl, userId || undefined)) || selectedLog.imageData) && (
                            <div className={styles.detailImageContainer}>
                                {selectedLog.imageUrl && isAllowedImageUrl(selectedLog.imageUrl, userId || undefined) ? (
                                    <Image
                                        src={getMediumUrl(selectedLog.imageUrl)}
                                        alt="冒険の写真"
                                        width={800}
                                        height={600}
                                        style={{ objectFit: 'contain' }}
                                        className={styles.detailImage}
                                        unoptimized
                                    />
                                ) : (
                                    <img
                                        src={selectedLog.imageData || ''}
                                        alt="冒険の写真"
                                        className={styles.detailImage}
                                    />
                                )}
                            </div>
                        )}

                        <div className={styles.detailMission}>
                            <span className={styles.detailLabel}>ミッション</span>
                            <p className={styles.detailMissionText}>{selectedLog.missionText}</p>
                        </div>

                        {selectedLog.location && (
                            <div className={styles.detailInfo}>
                                <span className={styles.detailLabel}>場所</span>
                                <p className={styles.detailText}>{selectedLog.location.name}</p>
                            </div>
                        )}

                        {selectedLog.memo && (
                            <div className={styles.detailInfo}>
                                <span className={styles.detailLabel}>メモ</span>
                                <p className={styles.detailText}>{selectedLog.memo}</p>
                            </div>
                        )}

                        <button
                            onClick={() => handleDeleteLog(selectedLog)}
                            className={styles.deleteButton}
                        >
                            この記録を削除
                        </button>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <main className={styles.main}>
                <div className={styles.headerContainer}>
                    <h1 className={styles.header}>冒険の書</h1>
                    <button onClick={() => router.push('/')} className={styles.homeButton}>
                        ホーム
                    </button>
                </div>

                <div className={styles.stats}>
                    <p className={styles.statsText}>
                        総冒険数: {logs.filter(log => log.status !== 'cancelled').length}回
                        {logs.filter(log => log.status === 'cancelled').length > 0 && (
                            <span style={{ marginLeft: '1rem', color: '#999', fontSize: '0.9em' }}>
                                (キャンセル: {logs.filter(log => log.status === 'cancelled').length}回)
                            </span>
                        )}
                    </p>
                </div>

                <div className={styles.logList}>
                    {logs.map((log, index) => (
                        <div
                            key={index}
                            onClick={() => setSelectedLog(log)}
                            className={`${styles.logCard} ${log.status === 'cancelled' ? styles.logCardCancelled : ''}`}
                        >
                            <div className={styles.logDate}>
                                {formatDate(log.createdAt)}
                                {log.status === 'cancelled' && <span className={styles.cancelledBadge}>キャンセル</span>}
                            </div>

                            {((log.imageUrl && isAllowedImageUrl(log.imageUrl, userId || undefined)) || log.imageData) && (
                                <div className={styles.logImageContainer}>
                                    {log.imageUrl && isAllowedImageUrl(log.imageUrl, userId || undefined) ? (
                                        <Image
                                            src={getThumbnailUrl(log.imageUrl)}
                                            alt="冒険の写真"
                                            width={150}
                                            height={150}
                                            style={{ objectFit: 'cover' }}
                                            className={styles.logImage}
                                            unoptimized
                                        />
                                    ) : (
                                        <img
                                            src={log.imageData || ''}
                                            alt="冒険の写真"
                                            className={styles.logImage}
                                        />
                                    )}
                                </div>
                            )}

                            <div className={styles.logContent}>
                                <p className={styles.logMission}>{log.missionText}</p>
                                {log.location && (
                                    <p className={styles.logLocation}>📍 {log.location.name}</p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <div className={styles.footer}>
                    <button onClick={() => router.push('/contact')} className={styles.contactButton}>
                        📧 お問い合わせ
                    </button>
                </div>
            </main>
        </div>
    );
}
