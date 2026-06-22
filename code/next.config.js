/**
 * `images.remotePatterns` (Tâche 1.4.5) : autorise `next/image` à
 * optimiser les images distantes hébergées sur Supabase Storage (photos
 * d'athlète, logos d'équipe/club, images de produit) — wildcard sur le
 * sous-domaine de projet `*.supabase.co` pour fonctionner identiquement en
 * développement et en production sans dupliquer la config par environnement
 * (chaque environnement a son propre projet Supabase, donc son propre
 * sous-domaine — voir docs/DEPLOIEMENT.md, Tâche 1.4.6).
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

module.exports = nextConfig;
