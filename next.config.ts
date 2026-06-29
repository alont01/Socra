import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  serverExternalPackages: ['@prisma/client', 'prisma'],
  // Define the `@/` alias directly in webpack. The tsconfig `paths` alias is not
  // reliably applied to the App Router page-entry layer on clean production
  // builds (pages failed with "Module not found: Can't resolve '@/...'" while
  // every other module resolved fine). Aliasing here covers all webpack layers.
  webpack: (config) => {
    config.resolve = config.resolve || {}
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@': path.resolve(process.cwd()),
    }
    return config
  },
}

export default nextConfig
