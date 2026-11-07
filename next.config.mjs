/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  reactStrictMode: true,
  webpack: (config) => {
    config.output.environment = { ...config.output.environment, asyncFunction: true, dynamicImport: true, module: true };
    return config;
  },
};
export default nextConfig;
