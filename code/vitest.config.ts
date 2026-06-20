import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      // Tâche 1.3 (moteur de crédit) désigne explicitement ce dossier dans
      // le cahier des charges (03-prompts-phase-0-et-1.md) plutôt que
      // tests/unit — voir docs/DECISIONS.md.
      'tests/credits/**/*.test.ts',
    ],
    // Les tests d'intégration démarrent un Postgres embarqué (téléchargement
    // du binaire au premier lancement + initdb) : plus lent qu'un test
    // unitaire classique.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
