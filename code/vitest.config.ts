import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    // Les tests d'intégration démarrent un Postgres embarqué (téléchargement
    // du binaire au premier lancement + initdb) : plus lent qu'un test
    // unitaire classique.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
