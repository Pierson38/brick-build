import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // do not write AGENTS.md into the repository on `next dev`
  agentRules: false,
  devIndicators: false,
  // pdf.js counts the pages of a booklet on the server (P8): loaded from node_modules, not bundled
  serverExternalPackages: ['pdfjs-dist'],
  // local app: no framing by other pages, no MIME sniffing, no referrer sent anywhere.
  // Production only (`next start`): not needed for the dev server used by the E2E suites.
  async headers() {
    if (process.env.NODE_ENV !== 'production') return [];
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
      ],
    }];
  },
};

export default nextConfig;
