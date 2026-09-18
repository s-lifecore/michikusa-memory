import admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

function getPrivateKey(): string | undefined {
    const raw = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    if (!raw) return undefined;
    return raw.replace(/\\n/g, '\n');
}

export function getAdminApp() {
    if (admin.apps.length > 0) {
        return admin.app();
    }

    // 環境変数が設定されている場合は優先
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKey = getPrivateKey();

    if (projectId && clientEmail && privateKey) {
        return admin.initializeApp({
            credential: admin.credential.cert({
                projectId,
                clientEmail,
                privateKey,
            }),
        });
    }

    // 環境変数がない場合はJSONファイルを読み込む
    const serviceAccountPath = path.join(
        process.cwd(),
        'reborn-e4c8d-firebase-adminsdk-fbsvc-bed32e5f21.json'
    );

    if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = JSON.parse(
            fs.readFileSync(serviceAccountPath, 'utf-8')
        );
        return admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
    }

    throw new Error('Firebase Admin 認証情報が見つかりません');
}

export function getAdminFirestore() {
    return getAdminApp().firestore();
}

export function getAdminAuth() {
    return getAdminApp().auth();
}
