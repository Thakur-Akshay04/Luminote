const apiHost = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://clerk.com https://*.clerk.accounts.dev",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data: https: http://localhost:8000 http://127.0.0.1:8000",
      `media-src 'self' blob: http://localhost:8000 http://127.0.0.1:8000 ${apiHost}`,
      `connect-src 'self' https://api.clerk.com https://*.clerk.accounts.dev http://localhost:8000 http://127.0.0.1:8000 ${apiHost}`,
      "frame-src 'none'",
    ].join('; ')
  }
];

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  serverExternalPackages: [],
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiHost}/:path*`,
      },
      {
        source: "/media/:path*",
        destination: `${apiHost}/media/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
