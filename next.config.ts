import createNextIntlPlugin from 'next-intl/plugin';
import type {NextConfig} from 'next';
import {withSentryConfig} from '@sentry/nextjs';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdfkit', '@embedpdf/fonts-arabic', 'web-push'],
  outputFileTracingIncludes: {
    '/*/account/wallet/statement.pdf': [
      './node_modules/@embedpdf/fonts-arabic/fonts/NotoNaskhArabic-Regular.ttf'
    ],
    '/*/admin/wallets/statement.pdf': [
      './node_modules/@embedpdf/fonts-arabic/fonts/NotoNaskhArabic-Regular.ttf'
    ],
    '/*/account/orders/*/invoice.pdf': [
      './node_modules/@embedpdf/fonts-arabic/fonts/NotoNaskhArabic-Regular.ttf'
    ],
    '/*/account/orders/*/receipt.pdf': [
      './node_modules/@embedpdf/fonts-arabic/fonts/NotoNaskhArabic-Regular.ttf'
    ],
    '/*/orders/*/invoice.pdf': [
      './node_modules/@embedpdf/fonts-arabic/fonts/NotoNaskhArabic-Regular.ttf'
    ],
    '/*/orders/*/receipt.pdf': [
      './node_modules/@embedpdf/fonts-arabic/fonts/NotoNaskhArabic-Regular.ttf'
    ]
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion']
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {protocol: 'https', hostname: '*.supabase.co'},
      {protocol: 'https', hostname: 'images.unsplash.com'}
    ]
  },
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {key: 'X-Content-Type-Options', value: 'nosniff'},
          {key: 'X-Frame-Options', value: 'DENY'},
          {key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload'},
          {key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin'},
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(self)'
          }
        ]
      },
      {
        source: '/_next/static/:path*',
        headers: [{key: 'Cache-Control', value: 'public, max-age=31536000, immutable'}]
      },
      {
        source: '/manifest.webmanifest',
        headers: [
          {key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400'}
        ]
      }
    ];
  }
};

export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  webpack: {treeshake: {removeDebugLogging: true}},
  sourcemaps: {deleteSourcemapsAfterUpload: true}
});
