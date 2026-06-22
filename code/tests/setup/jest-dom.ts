// Étend `expect` avec les matchers DOM (toBeVisible, toHaveTextContent...)
// pour les tests de composants (Tâche 1.4.2). Sans effet sur les tests
// purement métier exécutés sous l'environnement 'node'.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Sans ce nettoyage, le DOM rendu par un test reste présent pour le test
// suivant DANS LE MÊME FICHIER (jsdom n'est pas réinitialisé entre les
// `it()`), ce qui fait échouer `getByRole`/`getByText` dès qu'un fichier
// contient plusieurs rendus du même composant (ex. plusieurs `<Spinner
// role="status">` accumulés -> "multiple elements found").
afterEach(() => {
  cleanup();
});
