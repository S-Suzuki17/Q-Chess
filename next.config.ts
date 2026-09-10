import type { NextConfig } from 'next';

// Public values are embedded at build time; never publish a dummy backend.
if (process.env.VERCEL === '1') {
    for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) {
        const value = process.env[name]?.trim();
        if (!value || /placeholder|\[SENSITIVE\]/i.test(value)) {
            throw new Error(`Missing or invalid deployment configuration: ${name}`);
        }
    }
}

const nextConfig: NextConfig = {
    output: 'export',
    trailingSlash: true,
    images: {
        unoptimized: true,
    },
};

export default nextConfig;

