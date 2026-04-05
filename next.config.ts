import type { NextConfig } from "next";
import webpack from "webpack";
import withSerwistInit from "@serwist/next";
import { encodeHashInPrecacheUrls } from "./lib/serwist-precache-manifest";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  manifestTransforms: [encodeHashInPrecacheUrls],
});

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/staking", destination: "/claim", permanent: true },
    ]
  },
  // Empty turbopack config to satisfy Next.js requirement (we use webpack)
  turbopack: {},
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'morbiuslotto-production.up.railway.app',
        pathname: '/uploads/**',
      },
    ],
  },
  // Set output file tracing root to fix workspace detection warning
  outputFileTracingRoot: __dirname,
  // Mark server-only packages as external to prevent bundling
  serverExternalPackages: [
    "tap",
    "tape",
    "desm",
    "fastbench",
    "pino-elasticsearch",
    "why-is-node-running",
    "pino-pretty",
    "thread-stream",
    "pino",
    "winston",
  ],
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
      "tap": false,
      "tape": false,
      "desm": false,
      "fastbench": false,
      "pino-elasticsearch": false,
      "why-is-node-running": false,
      "thread-stream": false,
      "winston": false,
    };
    
    // Ensure matter-js and seedrandom are resolved from node_modules
    config.resolve.modules = [
      ...(config.resolve.modules || []),
      'node_modules',
    ];
    
    // Ignore test files using webpack IgnorePlugin
    config.plugins = config.plugins ?? [];
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /\.test\.(js|ts|tsx|mjs|cjs)$/,
      }),
      new webpack.IgnorePlugin({
        resourceRegExp: /\/test\//,
      }),
      // Ignore specific problematic test files
      new webpack.IgnorePlugin({
        resourceRegExp: /thread-stream\/test\//,
      }),
      new webpack.IgnorePlugin({
        resourceRegExp: /close-on-gc\.js$/,
      }),
      new webpack.IgnorePlugin({
        resourceRegExp: /create-and-exit\.js$/,
      })
    );
    
    return config;
  },
  typescript: {
    // Bypass TypeScript errors during build
    ignoreBuildErrors: true,
  },
  // ESLint configuration moved to eslint.config.mjs
};

export default withSerwist(nextConfig);
