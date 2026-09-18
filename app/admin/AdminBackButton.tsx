'use client';

import { useRouter, usePathname } from 'next/navigation';
import styles from './admin.module.css';

export default function AdminBackButton() {
    const router = useRouter();
    const pathname = usePathname();

    // /admin を除いたセグメント数を数える（例: /admin/users → 1, /admin/users/abc → 2）
    const segments = pathname.replace(/^\/admin\/?/, '').split('/').filter(Boolean);

    if (segments.length === 0) return null; // /admin ダッシュボードは非表示

    if (segments.length === 1) {
        // /admin/users など → ダッシュボードへ戻る
        return (
            <div className={styles.backBar}>
                <button className={styles.backButton} onClick={() => { router.push('/admin'); router.refresh(); }}>
                    ← ダッシュボードへ戻る
                </button>
            </div>
        );
    }

    // /admin/users/abc など → 親ページへ戻る
    const parentPath = '/admin/' + segments.slice(0, -1).join('/');
    return (
        <div className={styles.backBar}>
            <button className={styles.backButton} onClick={() => { router.push(parentPath); router.refresh(); }}>
                ← 戻る
            </button>
        </div>
    );
}
