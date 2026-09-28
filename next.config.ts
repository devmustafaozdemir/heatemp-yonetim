import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: { position: "bottom-right" },
  experimental: {
    serverActions: {
      // Ürün görseli yüklemesi (en fazla 5 MB) için
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
