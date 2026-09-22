import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Do not generate editor/agent instruction files in the repository.
  agentRules: false,
};

export default nextConfig;
