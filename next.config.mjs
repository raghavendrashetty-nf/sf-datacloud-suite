/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,
  reactStrictMode: true,
  webpack: (config) => {
    // pdfjs-dist optionally requires 'canvas' for node-side rendering; we only run it in
    // the browser, so alias it (and its friend 'encoding') to false to skip the module.
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      canvas: false,
      encoding: false
    };
    return config;
  }
};
export default nextConfig;
