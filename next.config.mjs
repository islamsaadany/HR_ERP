/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Every upload in the app travels through a server action, and Next's DEFAULT limit is
      // 1MB — smaller than every cap the forms advertise (10MB claim/payback proofs, 25MB
      // handbook/knowledge/learning files). Any receipt photo over 1MB therefore died as a raw
      // "Application error" page before the action even ran (found 2026-09-01: the whole team's
      // benefit claims). Sized to the largest advertised upload plus multipart overhead.
      bodySizeLimit: "26mb",
    },
  },
  images: {
    remotePatterns: [
      // Google account profile photos
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
};

export default nextConfig;
