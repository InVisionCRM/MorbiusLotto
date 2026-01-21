import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname, // ensure correct workspace root
  },
  transpilePackages: ['@rainbow-me/rainbowkit', 'wagmi', 'viem'],
  webpack: (config, { isServer }) => {
    // Some wallet/provider SDKs include optional node/react-native deps that
    // are not needed for the web bundle but can confuse webpack resolution.
    void isServer;
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false,
    };
    return config;
  },
  typescript: {
    // Bypass TypeScript errors during build
    ignoreBuildErrors: true,
  },
  // ESLint configuration moved to eslint.config.mjs
};

export default nextConfig;

