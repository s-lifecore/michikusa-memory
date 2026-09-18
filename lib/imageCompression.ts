/**
 * クライアント側の画像圧縮ユーティリティ
 * メモリ使用量を最小限に抑えながら、高品質な圧縮を実現
 */

export interface CompressionOptions {
    maxWidth?: number;
    maxHeight?: number;
    maxSizeMB?: number;
    quality?: number;
    format?: 'jpeg' | 'webp';
}

const DEFAULT_OPTIONS: CompressionOptions = {
    maxWidth: 1024,
    maxHeight: 1024,
    maxSizeMB: 5,
    quality: 0.8,
    format: 'jpeg',
};

/**
 * ファイルサイズを人間が読める形式に変換
 */
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * 画像を圧縮
 * createImageBitmap でデコード（base64変換不要）→ Canvas でリサイズ
 * FileReader.readAsDataURL より約30%メモリ効率が良く、EXIF回転も自動補正される
 * 対応: Chrome 54+, Safari iOS 15+, Firefox 98+
 */
export async function compressImage(
    file: File,
    options: CompressionOptions = {}
): Promise<Blob> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const maxWidth = opts.maxWidth || 1024;
    const maxHeight = opts.maxHeight || 1024;
    const maxBytes = (opts.maxSizeMB || 5) * 1024 * 1024;

    const bitmap = await createImageBitmap(file, {
        imageOrientation: 'from-image',
    });

    let { width, height } = bitmap;
    if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        bitmap.close();
        throw new Error('Failed to get canvas context');
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const mimeType = opts.format === 'webp' ? 'image/webp' : 'image/jpeg';
    let quality = opts.quality ?? 0.8;

    while (quality >= 0.4) {
        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, mimeType, quality);
        });

        if (!blob) {
            canvas.width = 0;
            canvas.height = 0;
            throw new Error('Failed to compress image');
        }

        if (blob.size <= maxBytes) {
            canvas.width = 0;
            canvas.height = 0;
            return blob;
        }

        quality = Math.round((quality - 0.1) * 10) / 10;
    }

    canvas.width = 0;
    canvas.height = 0;
    throw new Error('画像を規定サイズ内に圧縮できませんでした');
}

/**
 * 画像を圧縮してBase64に変換
 */
export async function compressImageToBase64(
    file: File,
    options: CompressionOptions = {}
): Promise<string> {
    const blob = await compressImage(file, options);

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            resolve(result);
        };
        reader.onerror = () => {
            reject(new Error('Failed to convert blob to base64'));
        };
        reader.readAsDataURL(blob);
    });
}

/**
 * 画像を圧縮してFileに変換
 */
export async function compressImageToFile(
    file: File,
    options: CompressionOptions = {}
): Promise<File> {
    const blob = await compressImage(file, options);
    const format = options.format === 'webp' ? 'webp' : 'jpeg';
    return new File([blob], `compressed.${format}`, { type: blob.type });
}
