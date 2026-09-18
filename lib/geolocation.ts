/**
 * 位置情報とタイムゾーン情報を取得するユーティリティ
 * Nominatim (Open Street Map) + ブラウザ標準 API を使用
 */

export interface GeoLocation {
    latitude: number;
    longitude: number;
    countryCode: string;
    countryName: string;
    region?: string;
    timezone?: string;
    localDateTime?: Date;
    brightness: 'dark' | 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'night';
}

/**
 * ブラウザから位置情報を取得
 */
export function getUserLocation(): Promise<{ latitude: number; longitude: number }> {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation is not supported by this browser'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                });
            },
            (error) => {
                reject(new Error(`Geolocation error: ${error.message}`));
            },
            {
                timeout: 10000,
                enableHighAccuracy: false,
            }
        );
    });
}

/**
 * ブラウザのタイムゾーンと現地時刻を取得（ローカル実装）
 */
function getTimezoneFromBrowser(): { timezone: string; localDateTime: Date } {
    // ブラウザから現在のタイムゾーンを取得
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo';
    const localDateTime = new Date();
    
    return { timezone, localDateTime };
}

/**
 * 時間帯から明るさレベルを判定
 */
function calculateBrightness(hour: number): GeoLocation['brightness'] {
    if (hour >= 5 && hour < 7) {
        return 'early_morning';
    } else if (hour >= 7 && hour < 12) {
        return 'morning';
    } else if (hour >= 12 && hour < 18) {
        return 'afternoon';
    } else if (hour >= 18 && hour < 21) {
        return 'evening';
    } else {
        return 'night';
    }
}

/**
 * 緯度経度から Nominatim API で国コードを取得
 */
export async function getCountryCodeFromCoordinates(
    latitude: number,
    longitude: number
): Promise<GeoLocation> {
    try {
        const response = await fetch(
            `/api/geocode?lat=${latitude}&lon=${longitude}`
        );

        if (!response.ok) {
            throw new Error(`Geocode API error: ${response.status}`);
        }

        const data = await response.json();

        // タイムゾーン情報を取得（ブラウザから）
        const timezoneInfo = getTimezoneFromBrowser();

        const localDateTime = timezoneInfo.localDateTime;
        const brightness = calculateBrightness(localDateTime.getHours());

        return {
            latitude,
            longitude,
            countryCode: data.address?.country_code?.toUpperCase() || 'JP',
            countryName: data.address?.country || 'Japan',
            region: data.address?.state || data.address?.province,
            timezone: timezoneInfo.timezone,
            localDateTime,
            brightness,
        };
    } catch (error) {
        console.error('[Geolocation] Nominatim API error:', error);
        // フォールバック（デフォルト日本）
        const now = new Date();
        return {
            latitude,
            longitude,
            countryCode: 'JP',
            countryName: 'Japan',
            timezone: 'Asia/Tokyo',
            localDateTime: now,
            brightness: calculateBrightness(now.getHours()),
        };
    }
}

/**
 * 位置情報を取得して国コード＋タイムゾーン情報を返す
 */
export async function getLocationInfo(): Promise<GeoLocation | null> {
    try {
        const coords = await getUserLocation();
        return await getCountryCodeFromCoordinates(coords.latitude, coords.longitude);
    } catch (error) {
        console.error('[Geolocation] Failed to get location:', error);
        return null;
    }
}