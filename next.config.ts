import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "markbase-github.vercel.app" }],
        destination: "https://markbase.io/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
