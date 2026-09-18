'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { validateUserId, validatePassword } from '@/lib/validation';
import { savePasswordHash } from '@/lib/password';
import { ensureAuthenticated, getCurrentFirebaseUid, refreshAuthToken } from '@/lib/firebase';
import styles from './setup.module.css';

export default function SetupPage() {
    const router = useRouter();
    const [mode, setMode] = useState<'signup' | 'login'>('signup');
    const [userId, setUserId] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const LOGIN_ATTEMPT_KEY = 'michikusa_memory_login_attempt';
    const MAX_LOGIN_ATTEMPTS = 5;
    const LOCK_MINUTES = 15;

    // Firebase匿名認証を確保
    useEffect(() => {
        ensureAuthenticated().catch((error) => {
            console.error('認証エラー:', error);
        });
    }, []);

    const getLoginAttempt = () => {
        try {
            const raw = localStorage.getItem(LOGIN_ATTEMPT_KEY);
            if (!raw) return { failureCount: 0 };
            return JSON.parse(raw) as { failureCount: number; lockUntil?: number; lastFailedAt?: number };
        } catch {
            return { failureCount: 0 };
        }
    };

    const saveLoginAttempt = (attempt: { failureCount: number; lockUntil?: number; lastFailedAt?: number }) => {
        try {
            localStorage.setItem(LOGIN_ATTEMPT_KEY, JSON.stringify(attempt));
        } catch {
            // localStorage 失敗時は無視
        }
    };

    const resetLoginAttempt = () => {
        try {
            localStorage.removeItem(LOGIN_ATTEMPT_KEY);
        } catch {
            // localStorage 失敗時は無視
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (mode === 'login') {
            await handleLogin();
        } else {
            await handleSignup();
        }
    };

    const handleLogin = async () => {
        const attempt = getLoginAttempt();
        const now = Date.now();
        if (attempt.lockUntil && now < attempt.lockUntil) {
            const unlockDate = new Date(attempt.lockUntil);
            setError(`ログイン試行が多すぎます。${unlockDate.toLocaleString()} までお待ちください。`);
            return;
        }

        // バリデーション
        const userIdValidation = validateUserId(userId);
        if (!userIdValidation.valid) {
            setError(userIdValidation.error!);
            return;
        }

        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) {
            setError(passwordValidation.error!);
            return;
        }

        setIsLoading(true);

        try {
            await ensureAuthenticated();
            const firebaseUid = getCurrentFirebaseUid() || '';
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, password, firebaseUid }),
            });

            const data = await response.json().catch(() => ({}));

            if (response.status === 429) {
                const retryAt = Number.isFinite(Number(data.retryAt))
                    ? Number(data.retryAt)
                    : now + LOCK_MINUTES * 60 * 1000;
                saveLoginAttempt({
                    failureCount: MAX_LOGIN_ATTEMPTS,
                    lockUntil: retryAt,
                    lastFailedAt: now,
                });
                const unlockDate = new Date(retryAt);
                setError(`ログイン試行が多すぎます。${unlockDate.toLocaleString()} までお待ちください。`);
                setIsLoading(false);
                return;
            }

            if (response.status >= 500 || data.code === 'SERVER_ERROR') {
                setError('サーバー側ログインに失敗しました。しばらくしてから再度お試しください。');
                setIsLoading(false);
                return;
            }

            if (data.code === 'INVALID_INPUT') {
                setError('入力内容を確認してください');
                setIsLoading(false);
                return;
            }

            if (!response.ok || !data.ok) {
                const newAttempt: { failureCount: number; lastFailedAt: number; lockUntil?: number } = {
                    failureCount: (attempt.failureCount || 0) + 1,
                    lastFailedAt: now,
                };
                if (newAttempt.failureCount >= MAX_LOGIN_ATTEMPTS) {
                    newAttempt.failureCount = MAX_LOGIN_ATTEMPTS;
                    newAttempt.lockUntil = now + LOCK_MINUTES * 60 * 1000;
                }
                saveLoginAttempt(newAttempt);
                setError('ユーザーIDまたはパスワードが間違っています');
                setIsLoading(false);
                return;
            }

            // 3. localStorage に保存
            await savePasswordHash(password);
            localStorage.setItem('reborn_userId', userId);

            // ログイン試行回数をリセット
            resetLoginAttempt();

            // カスタムクレームが反映されるようにトークンを強制リフレッシュ
            await refreshAuthToken();

            // 4. サーバーからログを受け取り localStorage にキャッシュ
            const logs = Array.isArray(data.logs) ? data.logs : [];
            localStorage.setItem('reborn_logs', JSON.stringify(logs));
            console.log(`ログイン成功: ${logs.length}件のログを取得しました`);

            // 5. ホームへリダイレクト
            router.push('/');
        } catch (err) {
            console.error('Login error:', err);
            setError('ログイン中にエラーが発生しました');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSignup = async () => {
        const userIdValidation = validateUserId(userId);
        if (!userIdValidation.valid) {
            setError(userIdValidation.error!);
            return;
        }

        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) {
            setError(passwordValidation.error!);
            return;
        }

        if (password !== confirmPassword) {
            setError('パスワードが一致しません');
            return;
        }

        setIsLoading(true);

        try {
            await ensureAuthenticated();
            const firebaseUid = getCurrentFirebaseUid() || '';
            const response = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, password, firebaseUid }),
            });

            const data = await response.json().catch(() => ({}));

            if (response.status === 429) {
                setError('サインアップ試行回数が多すぎます。しばらくしてからお試しください。');
                setIsLoading(false);
                return;
            }

            if (response.status === 409 || data.code === 'USER_EXISTS') {
                setError('このユーザーIDはすでに使用されています');
                setIsLoading(false);
                return;
            }

            if (!response.ok || !data.ok) {
                setError(data.message || '登録中にエラーが発生しました');
                setIsLoading(false);
                return;
            }

            // 4. localStorage にも保存（キャッシュ）
            await savePasswordHash(password);
            localStorage.setItem('reborn_userId', userId);
            localStorage.setItem('reborn_createdAt', new Date().toISOString());
            localStorage.setItem('reborn_logs', JSON.stringify([]));

            // カスタムクレームが反映されるようにトークンを強制リフレッシュ
            await refreshAuthToken();

            // 5. ホームへリダイレクト
            router.push('/');
        } catch (err) {
            console.error('Registration error:', err);
            setError('登録中にエラーが発生しました。しばらくしてから再度お試しください。');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <main className={styles.main}>
                <h1 className={styles.title}>{mode === 'signup' ? '初期設定' : 'ログイン'}</h1>
                <p className={styles.description}>
                    {mode === 'signup' ? (
                        <>
                            みちくさメモリーを始めるために、<br />
                            ユーザーIDとバックアップ用パスワードを設定してください。
                        </>
                    ) : (
                        'ユーザーIDとパスワードでログインしてください。'
                    )}
                </p>

                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.formGroup}>
                        <label htmlFor="userId" className={styles.label}>
                            ユーザーID
                        </label>
                        <input
                            type="text"
                            id="userId"
                            value={userId}
                            onChange={(e) => setUserId(e.target.value)}
                            className={styles.input}
                            placeholder="例: ocean_t_umi"
                            autoComplete="off"
                            disabled={isLoading}
                        />
                        <p className={styles.hint}>
                            英小文字、数字、アンダースコアが使用できます（3〜20文字、先頭は英字）
                        </p>
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="password" className={styles.label}>
                            バックアップパスワード（7桁の数字）
                        </label>
                        <input
                            type="password"
                            id="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={styles.input}
                            placeholder="1234567"
                            maxLength={7}
                            inputMode="numeric"
                            autoComplete="off"
                            disabled={isLoading}
                        />
                    </div>

                    {mode === 'signup' && (
                        <div className={styles.formGroup}>
                            <label htmlFor="confirmPassword" className={styles.label}>
                                パスワード（確認）
                            </label>
                            <input
                                type="password"
                                id="confirmPassword"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className={styles.input}
                                placeholder="1234567"
                                maxLength={7}
                                inputMode="numeric"
                                autoComplete="off"
                                disabled={isLoading}
                            />
                        </div>
                    )}

                    {error && <p className={styles.error}>{error}</p>}

                    <button
                        type="submit"
                        className={styles.submitButton}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            mode === 'signup' ? '設定中...' : 'ログイン中...'
                        ) : (
                            mode === 'signup' ? '設定を完了する' : 'ログインする'
                        )}
                    </button>
                </form>

                <button
                    onClick={() => {
                        setMode(mode === 'signup' ? 'login' : 'signup');
                        setError('');
                        setPassword('');
                        setConfirmPassword('');
                    }}
                    className={styles.toggleButton}
                    disabled={isLoading}
                >
                    {mode === 'signup' ? '既にアカウントをお持ちの方はこちら' : '新規登録はこちら'}
                </button>

                {mode === 'signup' && (
                    <p className={styles.note}>
                        ※ 一度設定したIDは変更できません<br />
                        ※ パスワードは端末移行時に必要になります
                    </p>
                )}
            </main>
        </div>
    );
}
