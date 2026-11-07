/**
 * Static export. BASE_PATH lets the site live in a sub-folder, e.g. GitHub Pages
 * serves https://<user>.github.io/<repo>/ → BASE_PATH=/<repo> (set by the deploy workflow).
 * @type {import('next').NextConfig}
 */
const basePath = (process.env.BASE_PATH || '').replace(/\/$/, '');

const nextConfig = {
  output: 'export',
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  webpack: (config) => {
    config.output.environment = { ...config.output.environment, asyncFunction: true, dynamicImport: true, module: true };
    return config;
  },
};
export default nextConfig;
