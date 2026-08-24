import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Q-GAMBIT: Quantum Chess',
    short_name: 'Q-GAMBIT',
    description: 'Quantum Superposition Chess',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#00ff41',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}