import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/admin-firestore';

export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => null);
    if (!body) {
        return NextResponse.json({ error: 'リクエストが不正です' }, { status: 400 });
    }

    const { name, email, subject, message } = body;

    if (!name || !email || !subject || !message) {
        return NextResponse.json({ error: '必須項目が入力されていません' }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return NextResponse.json({ error: '有効なメールアドレスを入力してください' }, { status: 400 });
    }

    // Firestore 書き込みは await しない（Admin SDK の初回認証が遅いため）
    // Node.js プロセスはイベントループが空になるまで生存するため書き込みは完了する
    getAdminDb().collection('contacts').add({
        name,
        email,
        subject,
        message,
        createdAt: new Date().toISOString(),
        status: 'new',
        userAgent: request.headers.get('user-agent') || '',
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
    }).catch((err) => {
        console.error('[Contact] Firestore write failed:', err);
    });

    return NextResponse.json({ success: true, message: 'お問い合わせを受け付けました' });
}
