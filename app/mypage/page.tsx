'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { resetPassword } from '@/lib/password';
import { deleteUserAccount, createBackupData, restoreLogsToFirestore } from '@/lib/firestore';
import { getErrorMessage, showErrorNotification, showSuccessNotification, showConfirmModal } from '@/lib/errorHandler';
import { ensureAuthenticated, hasUserIdClaim } from '@/lib/firebase';
import styles from './mypage.module.css';

// 復元試行管理用の型定義
interface RestoreAttempt {
    failureCount: number;
    lockedUntil: number | null; // Unix timestamp (ms)
}

export default function MyPage() {
    const router = useRouter();
    const [userId, setUserId] = useState<string | null>(null);
    const [totalAdventures, setTotalAdventures] = useState(0);
    const [showRestore, setShowRestore] = useState(false);
    const [restoreUserId, setRestoreUserId] = useState('');
    const [restorePassword, setRestorePassword] = useState('');
    const [error, setError] = useState('');
    const [showPasswordReset, setShowPasswordReset] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [passwordResetError, setPasswordResetError] = useState('');
    const [restoreAttempt, setRestoreAttempt] = useState<RestoreAttempt>({ failureCount: 0, lockedUntil: null });
    const [showDeleteAccount, setShowDeleteAccount] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');

    useEffect(() => {
        const storedUserId = localStorage.getItem('reborn_userId');
        if (!storedUserId) {
            router.push('/setup');
            return;
        }

        // 統計情報取得（同期）
        const logsString = localStorage.getItem('reborn_logs') || '[]';
        const logs = JSON.parse(logsString);
        setTotalAdventures(logs.length);

        // 復元試行状態を読み込み
        const attemptData = localStorage.getItem('michikusa_memory_restore_attempt');
        if (attemptData) {
            try {
                const attempt: RestoreAttempt = JSON.parse(attemptData);
                setRestoreAttempt(attempt);
            } catch (e) {
                console.error('復元試行データの読み込みに失敗しました:', e);
            }
        }

        // カスタムクレームがない場合は再認証へ（非同期チェック）
        ensureAuthenticated()
            .then(() => hasUserIdClaim(storedUserId))
            .then((hasClaim) => {
                if (!hasClaim) {
                    router.push('/setup');
                    return;
                }
                setUserId(storedUserId);
            })
            .catch(() => {
                router.push('/setup');
            });
    }, [router]);

    const handleBackup = async () => {
        try {
            if (!userId) {
                showErrorNotification('ユーザーIDが取得できません');
                return;
            }

            // Firestore からバックアップデータを作成
            const backupData = await createBackupData(userId);

            const dataStr = JSON.stringify(backupData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `michikusa_memory_backup_${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            URL.revokeObjectURL(url);

            showSuccessNotification('バックアップファイルをダウンロードしました');
        } catch (err) {
            const message = getErrorMessage(err);
            showErrorNotification(`バックアップ作成に失敗しました: ${message}`);
        }
    };

    const handleRestore = async () => {
        setError('');

        // ロック状態をチェック
        if (restoreAttempt.lockedUntil) {
            const now = Date.now();
            if (now < restoreAttempt.lockedUntil) {
                const remainingMinutes = Math.ceil((restoreAttempt.lockedUntil - now) / 60000);
                setError(`復元機能がロックされています。あと ${remainingMinutes} 分お待ちください。`);
                return;
            } else {
                // ロック期限が過ぎていればリセット
                const newAttempt: RestoreAttempt = { failureCount: 0, lockedUntil: null };
                setRestoreAttempt(newAttempt);
                localStorage.setItem('michikusa_memory_restore_attempt', JSON.stringify(newAttempt));
            }
        }

        // パスワードをサーバー側（Firestore）で検証
        let isValid = false;
        try {
            const verifyResponse = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: restoreUserId, password: restorePassword }),
            });
            const verifyData = await verifyResponse.json().catch(() => ({}));
            isValid = verifyResponse.ok && verifyData.ok === true;
        } catch {
            setError('サーバーへの接続に失敗しました。しばらくしてから再度お試しください。');
            return;
        }

        if (restoreUserId !== userId || !isValid) {
            // 失敗カウントをインクリメント
            const newFailureCount = restoreAttempt.failureCount + 1;
            let newLockedUntil = null;

            if (newFailureCount >= 3) {
                // 3回失敗したら60分ロック
                newLockedUntil = Date.now() + 60 * 60 * 1000; // 60分後
                const newAttempt: RestoreAttempt = { failureCount: newFailureCount, lockedUntil: newLockedUntil };
                setRestoreAttempt(newAttempt);
                localStorage.setItem('michikusa_memory_restore_attempt', JSON.stringify(newAttempt));
                setError('復元に3回失敗しました。60分間ロックされます。');
                return;
            }

            const newAttempt: RestoreAttempt = { failureCount: newFailureCount, lockedUntil: null };
            setRestoreAttempt(newAttempt);
            localStorage.setItem('michikusa_memory_restore_attempt', JSON.stringify(newAttempt));
            setError(`ユーザーIDまたはパスワードが正しくありません（残り ${3 - newFailureCount} 回）`);
            return;
        }

        // ファイル選択ダイアログを表示
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                const backupData = JSON.parse(text);

                // バックアップデータのバリデーション
                if (!backupData.version || !backupData.userId || !Array.isArray(backupData.logs)) {
                    setError('バックアップファイルの形式が正しくありません');
                    return;
                }

                if (backupData.userId !== userId) {
                    setError('異なるユーザーのバックアップファイルです');
                    return;
                }

                // Firestore に復元
                await restoreLogsToFirestore(userId, backupData.logs);

                // localStorage にもキャッシュ
                localStorage.setItem('reborn_logs', JSON.stringify(backupData.logs));

                // 成功したので試行カウントをリセット
                const resetAttempt: RestoreAttempt = { failureCount: 0, lockedUntil: null };
                setRestoreAttempt(resetAttempt);
                localStorage.setItem('michikusa_memory_restore_attempt', JSON.stringify(resetAttempt));

                setTotalAdventures(backupData.logs.length);
                setRestoreUserId('');
                setRestorePassword('');
                setShowRestore(false);
                showSuccessNotification(`${backupData.logs.length}件のログを復元しました`);
            } catch (err) {
                const message = getErrorMessage(err);
                setError(`復元に失敗しました: ${message}`);
            }
        };
        input.click();
    };

    const handlePasswordReset = async () => {
        setPasswordResetError('');

        if (!userId) {
            setPasswordResetError('ユーザーIDが取得できません');
            return;
        }

        // 現在のパスワードをサーバー側（Firestore）で検証
        let isValid = false;
        try {
            const verifyResponse = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, password: currentPassword }),
            });
            const verifyData = await verifyResponse.json().catch(() => ({}));
            isValid = verifyResponse.ok && verifyData.ok === true;
        } catch {
            setPasswordResetError('サーバーへの接続に失敗しました');
            return;
        }

        if (!isValid) {
            setPasswordResetError('現在のパスワードが正しくありません');
            return;
        }

        // 新しいパスワードを生成
        const newPassword = await resetPassword();
        if (newPassword) {
            setPasswordResetError('');
            setCurrentPassword('');
            setShowPasswordReset(false);
            showSuccessNotification(
                `パスワードが再設定されました。\n\n新しいパスワード: ${newPassword}\n\n※ 必ず控えてください。\n※ このメッセージを閉じた後に新パスワードは表示されません。`
            );
        } else {
            setPasswordResetError('パスワード再設定に失敗しました');
        }
    };

    const handleLogout = () => {
        showConfirmModal(
            'ログアウトしますか？\n必ずバックアップを取得してください。',
            () => {
                localStorage.clear();
                router.push('/setup');
            }
        );
    };

    const handleDeleteAccount = async () => {
        if (deleteConfirmText !== '削除') {
            showErrorNotification('「削除」と正確に入力してください');
            return;
        }

        if (!userId) {
            showErrorNotification('ユーザーIDが取得できません');
            return;
        }

        try {
            // 1. Cloudinary から画像を削除
            try {
                const cloudinaryResponse = await fetch('/api/cloudinary/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId }),
                });
                const cloudinaryData = await cloudinaryResponse.json();
                console.log('Cloudinary削除結果:', cloudinaryData);
            } catch (cloudinaryError) {
                console.warn('Cloudinary画像削除に失敗しましたが続行します:', cloudinaryError);
            }

            // 2. Firestore からユーザーとすべてのログを削除
            await deleteUserAccount(userId);

            // 3. localStorage もクリア
            localStorage.clear();

            showSuccessNotification('アカウントを完全に削除しました');

            // セットアップ画面へリダイレクト
            setTimeout(() => {
                router.push('/setup');
            }, 2000);
        } catch (err) {
            const message = getErrorMessage(err);
            showErrorNotification(`アカウント削除に失敗しました: ${message}`);
        }
    };

    if (!userId) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>読み込み中...</div>
            </div>
        );
    }

    return (
        <>
            <div className={styles.container}>
                <main className={styles.main}>
                    <div className={styles.headerContainer}>
                        <h1 className={styles.header}>マイページ</h1>
                    <button onClick={() => router.push('/')} className={styles.homeButton}>
                        ホーム
                    </button>
                </div>

                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>ユーザー情報</h2>
                    <div className={styles.infoCard}>
                        <div className={styles.infoRow}>
                            <span className={styles.infoLabel}>ユーザーID</span>
                            <span className={styles.infoValue}>{userId}</span>
                        </div>
                        <div className={styles.infoRow}>
                            <span className={styles.infoLabel}>総冒険数</span>
                            <span className={styles.infoValue}>{totalAdventures}回</span>
                        </div>
                    </div>
                </div>

                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>セキュリティ</h2>

                    <button
                        onClick={() => setShowPasswordReset(!showPasswordReset)}
                        className={styles.actionButton}
                    >
                        🔐 パスワードを再設定
                    </button>

                    {showPasswordReset && (
                        <div className={styles.restoreForm}>
                            <p className={styles.restoreNote}>
                                パスワードを再設定します。現在のパスワードを入力してください。
                            </p>
                            <input
                                type="password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                placeholder="現在のパスワード（7桁）"
                                maxLength={7}
                                className={styles.input}
                            />
                            {passwordResetError && (
                                <p className={styles.error}>{passwordResetError}</p>
                            )}
                            <button onClick={handlePasswordReset} className={styles.primaryButton}>
                                再設定する
                            </button>
                        </div>
                    )}
                </div>

                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>データ管理</h2>

                    <button onClick={handleBackup} className={styles.actionButton}>
                        📦 バックアップを作成
                    </button>

                    <button
                        onClick={() => setShowRestore(!showRestore)}
                        className={styles.actionButton}
                    >
                        🔄 復元
                    </button>

                    {showRestore && (
                        <div className={styles.restoreForm}>
                            <p className={styles.restoreNote}>
                                復元するには、ユーザーIDとパスワードを入力してください
                            </p>
                            <input
                                type="text"
                                value={restoreUserId}
                                onChange={(e) => setRestoreUserId(e.target.value)}
                                placeholder="ユーザーID"
                                className={styles.input}
                            />
                            <input
                                type="password"
                                value={restorePassword}
                                onChange={(e) => setRestorePassword(e.target.value)}
                                placeholder="パスワード（7桁）"
                                maxLength={7}
                                className={styles.input}
                            />
                            {error && <p className={styles.error}>{error}</p>}
                            <button onClick={handleRestore} className={styles.primaryButton}>
                                復元する
                            </button>
                        </div>
                    )}
                </div>

                <div className={styles.section}>
                    <button onClick={handleLogout} className={styles.dangerButton}>
                        ログアウト
                    </button>
                    <p className={styles.dangerNote}>
                        ※ ログアウト前に必ずバックアップを取得してください
                    </p>
                </div>

                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>危険な操作</h2>

                    <button
                        onClick={() => setShowDeleteAccount(!showDeleteAccount)}
                        className={styles.dangerButton}
                    >
                        🗑️ アカウントを削除
                    </button>

                    {showDeleteAccount && (
                        <div className={styles.restoreForm}>
                            <p className={styles.dangerNote}>
                                ⚠️ この操作は取り消せません。すべてのデータが完全に削除されます。
                            </p>
                            <p className={styles.restoreNote}>
                                削除を確定するには「削除」と入力してください
                            </p>
                            <input
                                type="text"
                                value={deleteConfirmText}
                                onChange={(e) => setDeleteConfirmText(e.target.value)}
                                placeholder="削除"
                                className={styles.input}
                            />
                            <button
                                onClick={handleDeleteAccount}
                                className={styles.dangerButton}
                                disabled={deleteConfirmText !== '削除'}
                            >
                                完全に削除する
                            </button>
                        </div>
                    )}
                </div>

                <div className={styles.section}>
                    <button onClick={() => router.push('/contact')} className={styles.contactButton}>
                        📧 お問い合わせ
                    </button>
                    <p className={styles.note}>
                        ご質問・ご意見・不具合報告などお気軽にお問い合わせください
                    </p>
                </div>
            </main>
        </div>
        </>
    );
}
