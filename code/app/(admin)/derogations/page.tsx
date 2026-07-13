/**
 * Écran admin minimal « Dérogations » (P.7, SPEC-PARAMETRES-PLATEFORME.md
 * §6, tâche « interface admin minimale pour créer une dérogation »).
 * Réservé à `platform_admin` (`can(user, 'create', { type: 'derogation' })`,
 * voir lib/auth/permissions.ts) -- même garde `notFound()` que
 * `app/(admin)/produits/nouveau/page.tsx` (ne pas révéler l'existence de
 * l'écran à un rôle non autorisé).
 *
 * Volontairement MINIMAL (spec §6, hors périmètre : « écran d'administration
 * des paramètres » -- ce module ne gère QUE `derogations_parametres`, jamais
 * `parametres_plateforme` lui-même, modifiable seulement via Supabase
 * Studio) : un formulaire pour poser une dérogation + la liste des 20
 * dernières (journal d'audit consultable, migration 0027).
 */
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import {
  createSupabaseDerogationsRepo,
  CLES_DEROGEABLES,
  ENTITES_VALIDES_PAR_CLE,
  type CleDerogeable,
} from '@/lib/derogations/derogations';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { createDerogationAction } from './actions';

export const metadata = {
  title: 'Dérogations',
};

const LIBELLE_CLE: Record<CleDerogeable, string> = {
  campagne_duree_jours: 'R1 — Durée maximale de campagne (jours)',
  campagne_athletes_max: 'R3 — Nombre maximum d’athlètes par campagne',
  campagne_commandes_max: 'R4 — Nombre maximum de commandes par campagne',
  campagne_produits_max: 'R5 — Nombre maximum de produits par campagne',
  equipe_campagnes_par_an_max: 'R7 — Campagnes par équipe par année',
};

const LIBELLE_ENTITE: Record<string, string> = {
  campagne: 'Campagne (id de la campagne déjà créée)',
  equipe: 'Équipe (id de l’équipe)',
  club: 'Club (id du club)',
  athlete: 'Athlète (id de l’athlète)',
};

function formatDateHeureFr(dateIso: string): string {
  return new Date(dateIso).toLocaleString('fr-CA');
}

export default async function DerogationsPage({
  searchParams,
}: {
  searchParams: { erreur?: string; avis?: string };
}): Promise<JSX.Element> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }
  if (!can(user, 'create', { type: 'derogation' })) {
    // Pas de scope à révéler à un non-admin -- même convention que le
    // dashboard admin (404, pas un message "accès refusé").
    notFound();
  }

  const supabase = createSupabaseServerClient();
  const repo = createSupabaseDerogationsRepo(supabase);
  const recentes = await repo.listRecent(20);

  return (
    <main className="page stack">
      <div className="page-header">
        <h1>Dérogations</h1>
        <p>
          Relever exceptionnellement un plafond de plateforme pour une équipe, un club ou une campagne précise —
          chaque dérogation exige une justification et reste tracée définitivement (aucune suppression, aucune
          modification). La dérogation ACTIVE pour une portée est toujours la plus récente enregistrée ici.
        </p>
      </div>

      {searchParams.erreur ? <Alert variant="error">{searchParams.erreur}</Alert> : null}
      {searchParams.avis ? <Alert variant="success">{searchParams.avis}</Alert> : null}

      <Card>
        <section className="stack stack--sm">
          <h2>Poser une dérogation</h2>
          <form action={createDerogationAction} className="form form--wide stack">
            <Field
              label="Règle"
              required
              hint="R2 (date de livraison) n’admet aucune dérogation (obligation légale). R8 (plafond annuel de crédit) se gère par libération manuelle des crédits en attente, pas ici."
            >
              <select name="cleParametre" required defaultValue="">
                <option value="" disabled>
                  — choisir —
                </option>
                {CLES_DEROGEABLES.map((cle) => (
                  <option key={cle} value={cle}>
                    {LIBELLE_CLE[cle]} (portée : {ENTITES_VALIDES_PAR_CLE[cle].join(' ou ')})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Type de portée" required>
              <select name="entiteType" required defaultValue="">
                <option value="" disabled>
                  — choisir —
                </option>
                <option value="equipe">{LIBELLE_ENTITE.equipe}</option>
                <option value="club">{LIBELLE_ENTITE.club}</option>
                <option value="campagne">{LIBELLE_ENTITE.campagne}</option>
              </select>
            </Field>

            <Field label="Id de la portée (uuid)" required>
              <input type="text" name="entiteId" required placeholder="00000000-0000-0000-0000-000000000000" />
            </Field>

            <Field label="Nouvelle valeur (entier)" required hint="Le nouveau plafond exceptionnel accordé.">
              <input type="number" name="valeurAppliquee" required min={1} step={1} />
            </Field>

            <Field
              label="Justification"
              required
              hint="Obligatoire, 10 caractères minimum -- reste dans le journal d’audit de façon permanente."
            >
              <textarea name="justification" required minLength={10} maxLength={2000} rows={3} />
            </Field>

            <Button type="submit" variant="primary">
              Enregistrer la dérogation
            </Button>
          </form>
        </section>
      </Card>

      <Card>
        <section className="stack stack--sm">
          <h2>Historique récent ({recentes.length})</h2>
          {recentes.length === 0 ? (
            <p className="muted">Aucune dérogation enregistrée pour le moment.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Règle</th>
                    <th>Portée</th>
                    <th>Nouvelle valeur</th>
                    <th>Justification</th>
                    <th>Posée le</th>
                  </tr>
                </thead>
                <tbody>
                  {recentes.map((derogation) => (
                    <tr key={derogation.id}>
                      <td>{derogation.cleParametre}</td>
                      <td>
                        {derogation.entiteType} — {derogation.entiteId}
                      </td>
                      <td>{String(derogation.valeurAppliquee)}</td>
                      <td>{derogation.justification}</td>
                      <td>{formatDateHeureFr(derogation.creeLe)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </Card>
    </main>
  );
}
