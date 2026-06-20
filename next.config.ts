import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // нужно для запуска в Docker
};

export default nextConfig;
