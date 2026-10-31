import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a phone on the same network open `next dev` at the Mac's LAN address;
  // Next 16 blocks dev assets for any origin but localhost otherwise.
  // Development only — it has no effect on a production build.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "*.local"],
};

export default nextConfig;
