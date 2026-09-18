import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getAdminFirestore, getAdminAuth } from '@/lib/firebase-admin';
import { validatePassword, validateUserId } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

type AttemptState = {
    count: number;
    firstAt: number;
};

const attempts = new Map<string, AttemptState>();

function getClientIp(req: NextRequest): string {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    const realIp = req.headers.get('x-real-ip');
    if (realIp) return realIp;
    return 'unknown';
}

function checkRateLimit(ip: string, now: number): { allowed: boolean } {
    const state = attempts.get(ip);
    if (!state) return { allowed: true };
    if (now - state.firstAt > WINDOW_MS) {
        attempts.delete(ip);
        return { allowed: true };
    }
    if (state.count >= MAX_ATTEMPTS) {
        return { allowed: false };
    }
    return { allowed: true };
}

function registerAttempt(ip: string, now: number) {
    const state = attempts.get(ip);
    if (!state || now - state.firstAt > WINDOW_MS) {
        attempts.set(ip, { count: 1, firstAt: now });
        return;
    }
    attempts.set(ip, { count: state.count + 1, firstAt: state.firstAt });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const userId = String(body?.userId || '').trim();
        const password = String(body?.password || '').trim();

        const userIdValidation = validateUserId(userId);
        const passwordValidation = validatePassword(password);
        if (!userIdValidation.valid || !passwordValidation.valid) {
            return NextResponse.json(
                { ok: false, code: 'INVALID_INPUT', message: userIdValidation.error || passwordValidation.error },
                { status: 400 }
            );
        }

        const ip = getClientIp(req);
        const now = Date.now();
        const limit = checkRateLimit(ip, now);
        if (!limit.allowed) {
            return NextResponse.json(
                { ok: false, code: 'RATE_LIMIT', message: 'サインアップ試行回数が多すぎます' },
                { status: 429 }
            );
        }

        registerAttempt(ip, now);

        const db = getAdminFirestore();
        const userRef = db.collection('users').doc(userId);
        const userSnap = await userRef.get();
        if (userSnap.exists) {
            return NextResponse.json(
                { ok: false, code: 'USER_EXISTS', message: 'このユーザーIDはすでに使用されています' },
                { status: 409 }
            );
        }

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        await userRef.set({
            userId,
            passwordHash: hash,
            createdAt: new Date().toISOString(),
            totalAdventures: 0,
            lastLoginAt: new Date().toISOString(),
        });

        // Firebase トークンにカスタムクレームとして userId を埋め込む
        const firebaseUid = String(body?.firebaseUid || '').trim();
        if (firebaseUid) {
            try {
                await getAdminAuth().setCustomUserClaims(firebaseUid, { userId });
            } catch (claimError) {
                console.error('Failed to set custom claim:', claimError);
            }
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Signup API error:', error);
        return NextResponse.json(
            { ok: false, code: 'SERVER_ERROR', message: 'サーバーエラーが発生しました' },
            { status: 500 }
        );
    }
}
