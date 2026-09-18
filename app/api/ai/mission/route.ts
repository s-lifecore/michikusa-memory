/**
 * AI ミッション生成 API
 * 
 * 使用外部API:
 * - Google Generative AI (Gemini API)
 *   URL: https://generativelanguage.googleapis.com/v1beta/models/gemini-*:generateContent
 *   用途: ユーザーの時間帯・天候・位置情報・タイムゾーン・明るさに基づいて
 *        パーソナライズされたミッション（お題）を生成
 *   認証: API キー (環境変数: AI_PROVIDER_API_KEY または GEMINI_API_KEY)
 *   モデル: gemini-1.5-flash-latest (高速・低コスト)
 * 
 * リクエスト形式:
 * POST /api/ai/mission
 * {
 *   "context": {
 *     "timeOfDay": "morning" | "afternoon" | "evening",
 *     "brightness": "dark" | "early_morning" | "morning" | "afternoon" | "evening" | "night",
 *     "weather": "clear" | "rainy" | ... ,
 *     "location": {
 *       "countryCode": "JP",
 *       "countryName": "Japan",
 *       "region": "Tokyo",
 *       "timezone": "Asia/Tokyo",
 *       "localDateTime": "2026-02-04T12:34:56Z"
 *     }
 *   }
 * }
 * 
 * レスポンス形式:
 * {
 *   "id": "ai_1744123496000",
 *   "text": "公園で一番大きな木の写真を撮る",
 *   "category": "observe",
 *   "difficulty": 2,
 *   "source": "ai",
 *   "reason": "昼間の公園で観察系のミッションを提案"
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { getRandomFallbackMission } from '@/data/fallbackMissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const rateLimitMap = new Map<string, { count: number; firstAt: number }>();

function getClientIp(req: NextRequest): string {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    const realIp = req.headers.get('x-real-ip');
    if (realIp) return realIp;
    return 'unknown';
}

function checkRateLimit(ip: string, now: number): boolean {
    const state = rateLimitMap.get(ip);
    if (!state || now - state.firstAt > RATE_LIMIT_WINDOW_MS) {
        rateLimitMap.set(ip, { count: 1, firstAt: now });
        return true;
    }
    if (state.count >= RATE_LIMIT_MAX) return false;
    rateLimitMap.set(ip, { ...state, count: state.count + 1 });
    return true;
}

// 環境変数の取得（優先順位: AI_PROVIDER_API_KEY > GEMINI_API_KEY）
const GEMINI_API_KEY = process.env.AI_PROVIDER_API_KEY || process.env.GEMINI_API_KEY;
// モデル名を環境変数から取得。未設定の場合は 'gemini-1.5-flash-latest' を使用
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest';

const SYSTEM_PROMPT = `あなたは「michikusa_memory」という散歩アプリのミッション生成AIです。
ユーザーに散歩のミッションを与える役割を持っています。

## お題生成の制約:
1. 安全性: 危険な行為、違法行為、他人に迷惑をかける行為は絶対に避ける
2. 簡潔性: 50文字以内で具体的かつ実行可能
3. カテゴリ: "observe"(観察), "move"(移動), "mood"(気分)のいずれか
4. 難易度: 1-5（1=誰でも簡単、5=挑戦的）
5. ポジティブ: 楽しく、前向きな体験になるもの
6. 写真撮影: ユーザーはカメラでお題に沿っていると思う写真を撮る必要があることを考慮すること
7. 時間制約: ときどき（約30%の確率で）「○分歩いた先の〜を撮影する」「○分以内に〜を見つける」のような時間的制約を付けたお題も出す（2〜15分程度が目安）

## 出力形式（JSON）:
{
    "text": "お題の文章（50文字以内）",
    "category": "observe | move | mood",
    "difficulty": 1-5の数値,
    "reason": "このお題を選んだ理由（100文字以内）"
}

## 良い例:
- "公園で一番大きな木の写真を撮る"（observe, 2）
- "猫を見かけたら立ち止まって3秒眺める"（observe, 1）
- "いつもと違う道を1本選んで歩く"（move, 2）
- "空を見上げて深呼吸を3回する"（mood, 1）
- "5分歩いた先のお店を撮影する"（move, 3、時間制約付き）
- "3分以内に花を見つけて撮る"（observe, 2、時間制約付き）
- "10分後に到着した場所の景色を撮影する"（move, 4、時間制約付き）

## 避けるべき例:
- 他人の家を覗く（プライバシー侵害）
- 私有地に入る（不法侵入）
- 危険な場所に行く（安全性）
- 長時間かかるもの（散歩の範囲を超える）

## ユーザーの`;

function getRandomFallback() {
    const mission = getRandomFallbackMission();
    console.log('[AI Mission] 🔄 Using FALLBACK mission:', mission.text);
    return {
        id: `fallback_${Date.now()}`,
        ...mission,
        source: 'fallback',
        reason: 'AI生成に失敗したため、フォールバックミッションを使用しました',
    };
}

function getBrightnessDescription(brightness: string): string {
    const descriptions: Record<string, string> = {
        dark: '暗い（夜中）',
        early_morning: '薄暗い（早朝）',
        morning: '明るい（朝）',
        afternoon: '非常に明るい（昼間）',
        evening: '薄暗くなっている（夕方）',
        night: '暗い（夜）',
    };
    return descriptions[brightness] || brightness;
}

export async function POST(req: NextRequest) {
    const ip = getClientIp(req);
    if (!checkRateLimit(ip, Date.now())) {
        return NextResponse.json(
            { ok: false, code: 'RATE_LIMIT' },
            { status: 429 }
        );
    }

    try {
        const body = await req.json();
        const context = body?.context || {};
        const timeOfDay = context.timeOfDay || 'day';
        const weather = context.weather || 'clear';
        const location = context.location || {};

        // デバッグ情報
        console.log('[AI Mission] Context:', { timeOfDay, weather, location });

        // AI未設定の場合はフォールバック
        if (!GEMINI_API_KEY) {
            console.warn('[AI Mission] GEMINI_API_KEY not set, using fallback');
            return NextResponse.json(getRandomFallback());
        }

        console.log('[AI Mission] Attempting Gemini API call...');
        console.log('[AI Mission] Using model:', GEMINI_MODEL);

        // Google Generative AI クライアント初期化
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

        const model = genAI.getGenerativeModel({
            model: GEMINI_MODEL,
            safetySettings: [ // 安全性設定を追加
                {
                    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                },
            ],
        });

        const locationInfo = location.countryCode
            ? `\n- 国: ${location.countryName}（${location.countryCode}）${location.region ? `\n- 地域: ${location.region}` : ''}${location.timezone ? `\n- タイムゾーン: ${location.timezone}` : ''}`
            : '';

        const brightnessInfo = context.brightness
            ? `\n- 明るさ: ${getBrightnessDescription(context.brightness)}`
            : '';

        const userPrompt = `現在の状況:
- 時間帯: ${timeOfDay}
- 天候: ${weather}${brightnessInfo}${locationInfo}

上記を考慮して、散歩のお題を1つ生成してください。JSON形式で返してください。`;

        const fullPrompt = `${SYSTEM_PROMPT}\n\n${userPrompt}`;

        // API呼び出し
        const result = await model.generateContent(fullPrompt);
        const response = result.response;
        const content = response.text();

        if (!content) {
            console.warn('[AI Mission] Empty response from Gemini, using fallback');
            return NextResponse.json(getRandomFallback());
        }

        console.log('[AI Mission] Response content:', content);

        // JSON 抽出（Gemini がマークダウンでラップすることがあるため）
        let jsonStr = content;
        const jsonMatch = content.match(/```(json)?\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch && jsonMatch[2]) {
            jsonStr = jsonMatch[2];
        } else {
            // フォールバックとして、最初の `{` と最後の `}` で囲まれた部分を抽出
            const firstBrace = jsonStr.indexOf('{');
            const lastBrace = jsonStr.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
            }
        }

        let missionData;
        try {
            missionData = JSON.parse(jsonStr);
        } catch (parseError) {
            // JSON パースエラー時、一般的なエスケープエラーを自動修正
            console.error('[AI Mission] Initial JSON parse failed, attempting to fix...', parseError);
            try {
                // ダブルクォートのエスケープエラーを修正（例: ""difficulty" -> "difficulty"）
                const fixedJsonStr = jsonStr.replace(/""+([a-zA-Z_][a-zA-Z0-9_]*)":/g, '"$1":');
                missionData = JSON.parse(fixedJsonStr);
                console.log('[AI Mission] JSON fixed and parsed successfully');
            } catch (fixError) {
                console.error('[AI Mission] Failed to parse JSON from response, using fallback.', fixError);
                console.error('[AI Mission] Original content:', content);
                return NextResponse.json(getRandomFallback());
            }
        }


        // バリデーション
        if (!missionData.text || !missionData.category || !missionData.difficulty) {
            console.warn('[AI Mission] Invalid mission data received from AI:', missionData);
            return NextResponse.json(getRandomFallback());
        }

        if (missionData.text.length > 50) {
            missionData.text = missionData.text.substring(0, 50);
        }

        console.log('[AI Mission] Successfully generated AI mission');

        const aiMission = {
            id: `ai_${Date.now()}`,
            text: missionData.text,
            category: missionData.category,
            difficulty: Number(missionData.difficulty) || 2,
            source: 'ai',
            reason: missionData.reason || 'AIが現在の状況に合わせて生成しました',
        };

        console.log('[AI Mission] ✨ AI Generated mission:', aiMission.text);

        return NextResponse.json(aiMission);
    } catch (error) {
        console.error('[AI Mission] ❌ Generate mission API error:', error);
        // エラーがAPIからのものか、それ以外かを判断
        if (error instanceof Error) {
            console.error('[AI Mission] Error message:', error.message);
        }
        const fallback = getRandomFallback();
        return NextResponse.json(fallback);
    }
}
