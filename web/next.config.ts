import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The repo root also holds the CLI's package-lock.json. Without this line Next.js
  // guesses the repo root as the project root and may resolve packages from the CLI.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
