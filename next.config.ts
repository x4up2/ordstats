import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "render.ord.net",
        pathname: "/v5/snapshots/**",
      },
    ],
  },
};

export default nextConfig;
