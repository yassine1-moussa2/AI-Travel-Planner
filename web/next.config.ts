import path from "node:path";
import type { NextConfig } from "next";

// Where the page may load things from. Map tiles, glyphs and sprites come from OpenFreeMap;
// fonts from Google Fonts. Next.js injects small inline scripts, hence 'unsafe-inline'.
// Development needs eval and a websocket for hot reload, so the policy is production only.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://tiles.openfreemap.org",
  "connect-src 'self' https://tiles.openfreemap.org",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // The repo also holds the archived CLI's package-lock.json (in prototype/). Pinning the root
  // here stops Next.js from guessing another folder as the project root.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Don't tell strangers which framework runs the site.
  poweredByHeader: false,
  async headers() {
    const headers = [...SECURITY_HEADERS];
    if (process.env.NODE_ENV === "production") {
      headers.push({ key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY });
    }
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
