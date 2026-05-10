import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['pg', 'ioredis', 'bullmq', 'pdfkit', 'exceljs'],
  output: 'standalone',
}

export default nextConfig
