import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Receipt CSV uploads go through a server action.
    serverActions: { bodySizeLimit: "3mb" },
  },
};

export default nextConfig;
