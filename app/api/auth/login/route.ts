import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getAdminFirestore, getAdminAuth } from '@/lib/firebase-admin';
import { validatePassword, validateUserId } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;

type AttemptState = {
    count: number;
    firstAt: number;
    lockUntil?: number;
};

const attempts = new Map<string, AttemptState>();

function getClientIp(req: NextRequest): string {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    const realIp = req.headers.get('x-real-ip');
    if (realIp) return realIp;
    return 'unknown';
}

function getKey(ip: string, userId: string) {
    return `${ip}:${userId}`;
}

function checkRateLimit(key: string, now: number): { allowed: boolean; retryAt?: number } {
    const state = attempts.get(key);
    if (!state) return { allowed: true };
    if (state.lockUntil && now < state.lockUntil) {
        return { allowed: false, retryAt: state.lockUntil };
    }
    if (now - state.firstAt > WINDOW_MS) {
        attempts.delete(key);
        return { allowed: true };
    }
    return { allowed: true };
}

function registerFailure(key: string, now: number) {
    const state = attempts.get(key);
    if (!state || now - state.firstAt > WINDOW_MS) {
        attempts.set(key, { count: 1, firstAt: now });
        return;
    }

    const nextCount = state.count + 1;
    const nextState: AttemptState = { ...state, count: nextCount };
    if (nextCount >= MAX_ATTEMPTS) {
        nextState.count = MAX_ATTEMPTS;
        nextState.lockUntil = now + LOCK_MS;
    }
    attempts.set(key, nextState);
}

function resetAttempts(key: string) {
    attempts.delete(key);
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
                { ok: false, code: 'INVALID_INPUT' },
                { status: 400 }
            );
        }

        const ip = getClientIp(req);
        const key = getKey(ip, userId);
        const now = Date.now();
        const limit = checkRateLimit(key, now);
        if (!limit.allowed) {
            return NextResponse.json(
                { ok: false, code: 'RATE_LIMIT', retryAt: limit.retryAt },
                { status: 429 }
            );
        }

        const db = getAdminFirestore();
        const userRef = db.collection('users').doc(userId);
        const userSnap = await userRef.get();
        if (!userSnap.exists) {
            registerFailure(key, now);
            return NextResponse.json(
                { ok: false, code: 'INVALID_CREDENTIALS' },
                { status: 401 }
            );
        }

        const user = userSnap.data() as { passwordHash?: string };
        if (!user?.passwordHash) {
            registerFailure(key, now);
            return NextResponse.json(
                { ok: false, code: 'INVALID_CREDENTIALS' },
                { status: 401 }
            );
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
            registerFailure(key, now);
            return NextResponse.json(
                { ok: false, code: 'INVALID_CREDENTIALS' },
                { status: 401 }
            );
        }

        resetAttempts(key);

        await userRef.set({ lastLoginAt: new Date().toISOString() }, { merge: true });

        // Firebase トークンにカスタムクレームとして userId を埋め込む
        const firebaseUid = String(body?.firebaseUid || '').trim();
        if (firebaseUid) {
            try {
                await getAdminAuth().setCustomUserClaims(firebaseUid, { userId });
            } catch (claimError) {
                console.error('Failed to set custom claim:', claimError);
            }
        }

        const logsSnap = await userRef.collection('logs').orderBy('createdAt', 'desc').get();
        const logs = logsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        return NextResponse.json({ ok: true, logs });
    } catch (error) {
        console.error('Login API error:', error);
        return NextResponse.json(
            { ok: false, code: 'SERVER_ERROR' },
            { status: 500 }
        );
    }
}
