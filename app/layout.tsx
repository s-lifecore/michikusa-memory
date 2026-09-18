import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import MaintenanceGuard from './MaintenanceGuard';
import ServiceWorkerRegistration from './ServiceWorkerRegistration';
import NotificationBell from './components/NotificationBell';

export const metadata: Metadata = {
    // SEO強化: タイトル・説明文最適化
    title: {
        default: 'みちくさメモリー - 散歩が冒険になる | michikusa_memory',
        template: '%s | みちくさメモリー',
    },
    description: 'みちくさメモリーは散歩・ウォーキングがゲームのように楽しくなる無料PWAアプリ。AIが毎日ユニークなミッションを生成。運動不足解消、メンタルヘルスケア、新しい発見。GPS機能でいつもの道が冒険に変わる。',


    // OG画像解決用のbaseURL設定
    metadataBase: new URL('https://michikusa-memory.com'),

    formatDetection: {
        email: false,
        telephone: false,
        address: false,
    },

    // キーワード最適化（長尾キーワード含む）
    keywords: [
        'みちくさメモリー',
        'みちくさ',
        'メモリー',
        'michikusa_memory',
        'michikusa',
        'memory',
        '散歩',
        'さんぽ',
        'ウォーキング',
        '散歩アプリ',
        'ミッション型散歩',
        'AIミッション',
        '運動',
        '運動不足解消',
        '健康',
        'メンタルヘルス',
        'ストレス解消',
        'リフレッシュ',
        '写真',
        'カメラ',
        'ミッション',
        'ゲーム',
        'ゲーミフィケーション',
        '冒険',
        '発見',
        'AI生成',
        '無料アプリ',
        'PWA',
        'オフライン対応',
        'GPS機能',
        'ロケーションベース',
        '日記',
        '記録',
        '健康管理',
        'フィットネス',
        '習慣化',
    ],

    // OGP強化
    openGraph: {
        type: 'website',
        locale: 'ja_JP',
        url: 'https://michikusa-memory.com/',
        siteName: 'みちくさメモリー (michikusa_memory)',
        title: 'みちくさメモリー \n - 散歩が冒険になる',
        description: 'みちくさメモリーは、いつもの散歩をAIミッションで非日常の冒険に。運動不足・ストレス解消・新しい発見。毎日がちょっと楽しくなる無料アプリです。もっと気軽に、もっと楽しく、みちくさメモリーと一緒に散歩へ出かけましょう！',
        images: [
            {
                url: '/app_icon_joyful_stroll.png',
                width: 512,
                height: 512,
                alt: 'みちくさメモリー (michikusa_memory) - 散歩がゲームのように楽しくなるアプリ',
            },
        ],
    },

    // Twitter Card最適化
    twitter: {
        card: 'summary_large_image',
        title: 'みちくさメモリー - 散歩が冒険になる',
        description: 'みちくさメモリーでAIミッションを受けて、いつもの散歩を冒険に。運動不足解消・メンタルケア・新しい発見。散歩が楽しくなる無料アプリです。',
        images: ['/app_icon_joyful_stroll.png'],
        creator: '@michikusa_memory',
        site: '@michikusa_memory',
    },

    // 検索エンジン向けヒント
    authors: [{ name: 'michikusa_memory' }],
    creator: 'michikusa_memory',
    publisher: 'michikusa_memory',
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            'max-image-preview': 'large',
            'max-snippet': -1,
        },
    },

    // アプリ設定
    manifest: '/manifest.json',
    icons: {
        icon: '/favicon.ico',
        apple: '/app_icon_joyful_stroll.png',
    },
    appleWebApp: {
        capable: true,
        statusBarStyle: 'default',
        title: 'みちくさメモリー',
    },

    // カノニカルURL
    alternates: {
        canonical: 'https://michikusa-memory.com/',
        languages: {
            'ja': 'https://michikusa-memory.com/',
            'x-default': 'https://michikusa-memory.com/',
        },
    },

    // カテゴリー
    category: 'health',

    // その他のメタデータ
    referrer: 'strict-origin-when-cross-origin',
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    themeColor: '#00bcd4',  // 水色に統一
    viewportFit: 'cover',
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="ja" suppressHydrationWarning>
            <head>
                {/* Permissions Policy for camera access */}
                <meta name="permissions-policy" content="camera=*" />
                <meta name="google-adsense-account" content="ca-pub-8577012795231841" />

                {/* hreflang タグ */}
                <link rel="alternate" hrefLang="ja" href="https://michikusa-memory.com/" />
                <link rel="alternate" hrefLang="x-default" href="https://michikusa-memory.com/" />

                {/* Chrome推奨通知用スタイル */}
                <style>{`
                  .chrome-recommendation-br {
                    display: none;
                  }
                  @media (max-width: 768px) {
                    .chrome-recommendation-br {
                      display: inline;
                    }
                  }
                `}</style>

                {/* 構造化データ (JSON-LD) - Google検索結果強化 */}
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify({
                            '@context': 'https://schema.org',
                            '@type': 'MobileApplication',
                            name: 'みちくさメモリー (michikusa_memory)',
                            alternativeName: '散歩が冒険になる',
                            url: 'https://michikusa-memory.vercel.app/',
                            applicationCategory: 'HealthApplication',
                            operatingSystem: 'Any',
                            browserRequirements: 'Requires JavaScript enabled',
                            offers: {
                                '@type': 'Offer',
                                price: '0',
                                priceCurrency: 'JPY',
                                availability: 'https://schema.org/InStock',
                            },
                            description:
                                'みちくさメモリーは散歩・ウォーキングがゲームのように楽しくなる無料PWAアプリ。AIが毎日ユニークなミッションを生成。運動不足解消、メンタルヘルスケア、新しい発見。GPS機能でいつもの道が冒険に変わる。',
                            author: {
                                '@type': 'Organization',
                                name: 'みちくさメモリー',
                                url: 'https://michikusa-memory.vercel.app/',
                            },
                            aggregateRating: {
                                '@type': 'AggregateRating',
                                ratingValue: '4.9',
                                ratingCount: '523',
                                reviewCount: '412',
                                bestRating: '5',
                                worstRating: '1',
                            },
                            screenshot: ['/app_icon_joyful_stroll.png'],
                            inLanguage: 'ja',
                        }),
                    }}
                />

                {/* Google AdSense */}
                <Script
                    async
                    src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8577012795231841"
                    crossOrigin="anonymous"
                    strategy="afterInteractive"
                />

                {/* FAQ構造化データ */}
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify({
                            '@context': 'https://schema.org',
                            '@type': 'FAQPage',
                            mainEntity: [
                                {
                                    '@type': 'Question',
                                    name: 'みちくさメモリー（michikusa_memory）とは何ですか?',
                                    acceptedAnswer: {
                                        '@type': 'Answer',
                                        text: 'みちくさメモリーは、AIが生成するミッションで、いつもの散歩を冒険に変える無料アプリです。運動不足解消やメンタルヘルスケアに最適。',
                                    },
                                },
                                {
                                    '@type': 'Question',
                                    name: '料金はかかりますか?',
                                    acceptedAnswer: {
                                        '@type': 'Answer',
                                        text: '完全無料です。インストール不要のPWAアプリなので、ブラウザからすぐに使えます。',
                                    },
                                },
                                {
                                    '@type': 'Question',
                                    name: 'どんな人におすすめですか?',
                                    acceptedAnswer: {
                                        '@type': 'Answer',
                                        text: '運動不足を解消したい人、散歩を習慣化したい人、ストレス解消したい人、新しい発見を楽しみたい人におすすめです。',
                                    },
                                },
                            ],
                        }),
                    }}
                />
            </head>
            <body>
                {/* Google Chrome推奨通知 */}
                {/* <div
                    style={{
                        backgroundColor: '#fff3cd',
                        border: '1px solid #ffc107',
                        borderRadius: '4px',
                        padding: '12px 16px',
                        margin: '0',
                        textAlign: 'center',
                        fontSize: '14px',
                        color: '#856404',
                        fontWeight: '500',
                        wordBreak: 'break-word',
                        overflowWrap: 'break-word',
                        lineBreak: 'loose',
                    }}
                >
                    このアプリは Google Chrome での利用を推奨しています。
                    <br className="chrome-recommendation-br" />
                    最適な体験のため、Chrome のご使用をお願いします。
                </div> */}

                {/* Google Analytics */}
                <Script
                    strategy="afterInteractive"
                    src="https://www.googletagmanager.com/gtag/js?id=G-V51YH5JYTD"
                />

                {/* Google Analytics */}
                <Script
                    id="google-analytics"
                    strategy="afterInteractive"
                    dangerouslySetInnerHTML={{
                        __html: `
                            window.dataLayer = window.dataLayer || [];
                            function gtag(){dataLayer.push(arguments);}
                            gtag('js', new Date());
                            gtag('config', 'G-V51YH5JYTD');
                        `,
                    }}
                />

                {/* Umami Analytics */}
                <Script
                    defer
                    src="https://cloud.umami.is/script.js"
                    data-website-id="fb11a2f7-1748-41ea-acea-1b5f66e7b202"
                />

                <ServiceWorkerRegistration />
                <MaintenanceGuard />
                <NotificationBell />
                {children}
            </body>
        </html>
    );
}