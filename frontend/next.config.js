/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // In Next.js 15, experimental.serverComponentsExternalPackages is now top-level
  serverExternalPackages: [],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
