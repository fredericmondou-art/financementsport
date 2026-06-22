'use client';

/**
 * Page d'erreur globale (Tâche 1.4.5). Limite d'erreur React de
 * l'App Router (`error.tsx` — DOIT être un composant client, convention
 * Next.js) : capture toute exception non gérée levée pendant le rendu d'une
 * route et affiche un message de secours en français au lieu d'un écran
 * blanc, avec un bouton « Réessayer » qui retente le rendu (prop `reset`
 * fournie par Next.js) plutôt qu'un rechargement complet de page.
 *
 * Ne journalise jamais l'erreur brute à l'écran (pourrait exposer des
 * détails internes) ; seul un message générique est affiché à
 * l'utilisateur·rice. `console.error` est acceptable ici (hors logique
 * métier, juste un point de diagnostic local) — voir CLAUDE.md section 6
 * sur l'absence de `console.log` en production pour le reste du code.
 */
import { useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }): JSX.Element {
  useEffect(() => {
    // eslint-disable-next-line no-console -- limite d'erreur globale : seul point de diagnostic disponible côté client.
    console.error(error);
  }, [error]);

  return (
    <main className="page">
      <Card>
        <div className="error-state">
          <p className="error-state__icon" aria-hidden="true">
            ⚠️
          </p>
          <h1 className="error-state__title">Une erreur est survenue</h1>
          <p>
            Quelque chose s&rsquo;est mal passé de notre côté. Vous pouvez réessayer, ou revenir à
            l&rsquo;accueil si le problème persiste.
          </p>
          <div className="form__actions">
            <Button type="button" onClick={reset}>
              Réessayer
            </Button>
            <Button href="/" variant="outline">
              Retour à l&rsquo;accueil
            </Button>
          </div>
        </div>
      </Card>
    </main>
  );
}
