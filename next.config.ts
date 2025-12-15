import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname, // ensure correct workspace root
  },
  transpilePackages: ['wagmi', 'viem'],
};

export default nextConfig;

