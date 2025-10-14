import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable lint/type blocking during build on servers
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
