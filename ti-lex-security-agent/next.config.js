/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Les Edge Functions Supabase (Deno) ne font pas partie du build Next.js.
  // On les exclut via tsconfig "exclude".
};

module.exports = nextConfig;
