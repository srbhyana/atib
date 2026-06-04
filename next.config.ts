import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  // Next.js 16 removed the `eslint` config block — ESLint is now a separate
  // `next lint` step, not part of `next build`. We rely on `npm run lint`
  // locally + in CI rather than build-time enforcement.
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
