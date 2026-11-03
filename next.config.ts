import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // do not write AGENTS.md into the repository on `next dev`
  agentRules: false,
  devIndicators: false,
};

export default nextConfig;
