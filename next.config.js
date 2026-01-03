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
      '@ffmpeg-installer/darwin-arm64',
      '@ffmpeg-installer/darwin-x64',
      '@ffmpeg-installer/linux-arm64',
      '@ffmpeg-installer/linux-x64',
      '@ffmpeg-installer/win32-x64',
    ],
    // Enable instrumentation hook for server startup cleanup
    instrumentationHook: true,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Don't bundle canvas on the server
      config.externals.push({
        canvas: 'canvas',
      });
      // Don't bundle platform-specific ffmpeg installers
      config.externals.push({
        '@ffmpeg-installer/darwin-arm64': '@ffmpeg-installer/darwin-arm64',
        '@ffmpeg-installer/darwin-x64': '@ffmpeg-installer/darwin-x64',
        '@ffmpeg-installer/linux-arm64': '@ffmpeg-installer/linux-arm64',
        '@ffmpeg-installer/linux-x64': '@ffmpeg-installer/linux-x64',
        '@ffmpeg-installer/win32-x64': '@ffmpeg-installer/win32-x64',
      });
    }
    
    return config;
  },
}

module.exports = nextConfig
