/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Required to make Konva & react-konva work - handles canvas module issues
    config.externals = [...(config.externals || []), { canvas: 'canvas' }];
    return config;
  },
};

module.exports = nextConfig; 