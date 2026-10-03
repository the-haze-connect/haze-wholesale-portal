/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Product photo uploads (up to 4 MB) go through a server action
  experimental: { serverActions: { bodySizeLimit: '5mb' } },
};

export default nextConfig;
