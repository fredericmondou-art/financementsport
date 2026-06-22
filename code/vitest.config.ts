import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Nécessaire pour transformer le JSX des tests de composants
  // (tests/unit/**/*.test.tsx, Tâche 1.4.2).
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    // Par défaut 'node' (rapide, pour toute la logique métier pure de lib/).
    // Les fichiers qui rendent des composants React passent en 'jsdom' via
    // un commentaire `// @vitest-environment jsdom` en tête de fichier,
    // plutôt que de ralentir toute la suite — voir docs/DECISIONS.md.
    environment: 'node',
    setupFiles: ['./tests/setup/jest-dom.ts'],
    include: [
      'tests/unit/**/*.test.ts',
      'tests/unit/**/*.test.tsx',
      'tests/integration/**/*.test.ts',
    ],
    // Les tests d'intégration démarrent un Postgres embarqué (téléchargement
    // du binaire au premier lancement + initdb) : plus lent qu'un test
    // unitaire classique.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
