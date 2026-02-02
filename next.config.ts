// =============================================================
// next.config.ts
// =============================================================

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow images from common hosting providers
  images: {
    remotePatterns: [
      { hostname: '*.unsplash.com' },
      { hostname: '*.pexels.com' },
      { hostname: '*.firebaseio.com' },
    ],
  },

  // Strict mode for catching side-effect bugs early
  reactStrictMode: true,

  // Typescript paths are handled by tsconfig paths + next's built-in support
};

export default nextConfig;
