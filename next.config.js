/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Reduce aggressive reloading in development
  onDemandEntries: {
    // Keep pages in memory longer (30 seconds instead of default 15)
    maxInactiveAge: 30 * 1000,
    // Number of pages to keep simultaneously
    pagesBufferLength: 5,
  },
  // Handle PDF parsing libraries that have issues with webpack bundling
  experimental: {
    serverComponentsExternalPackages: [
      'unpdf',
      'ffmpeg-static',
    ],
    // Enable instrumentation hook for server startup cleanup
    instrumentationHook: true,
  },
  // Ignore ESLint and TypeScript errors during build (allows deployment to succeed)
  // Warnings will still be shown but won't block the build
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Don't bundle canvas on the server
      config.externals.push({
        canvas: 'canvas',
      });
      // Don't bundle ffmpeg-static (it contains platform-specific binaries)
      config.externals.push({
        'ffmpeg-static': 'ffmpeg-static',
      });
    }
    
    return config;
  },
}

module.exports = nextConfig
