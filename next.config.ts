import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  trailingSlash: false,
  async redirects() {
    return [
      { source: "/portfolio", destination: "/dashboard", permanent: true },
      {
        source: "/api/portfolio/:path*",
        destination: "/api/dashboard/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
