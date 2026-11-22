import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@cadence/ui', '@cadence/billing-core'],
  poweredByHeader: false,
};

export default config;
