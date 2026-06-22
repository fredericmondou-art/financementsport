/**
 * Assistant de création de campagne (Tâche 1.7) : Server Component, formulaire
 * natif unique (pas de "use client", CLAUDE.md section 6 — même style que
 * `app/(shop)/panier/page.tsx`). Réservé à `team_manager`/`club_admin` (et
 * `platform_admin`) -- `lib/campaigns/create-campaign.ts#createCampaign` est
 * la source de vérité pour les permissions ; cette page se contente de ne pas
 * afficher le formulaire aux rôles qui ne pourront de toute façon rien
 * soumettre, par cohérence d'expérience.
 *
 * Les équipes/clubs gérés et leurs athlètes sont listés à titre indicatif
 * (`lib/campaigns/manager-scope.ts`) pour permettre de copier-coller les
 * identifiants dans le formulaire -- mêmes contraintes "sans JS" que
 * `app/(shop)/panier/page.tsx` (ex. `productId` saisi en texte brut).
 *
 * Habillage Tâche 1.4.4 : Card/Field/Alert/Button du système de design,
 * présentation uniquement — tous les `role="alert"`/`role="status"` sont
 * conservés via le composant `Alert`, et chaque champ conserve son
 * association label/contrôle (via `Field`, ou manuellement pour les listes
 * de cases à cocher).
 */
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { createSupabaseProductRepo, listPublicProducts } from '@/lib/catalog/products';
import { loadCampaignWizardOptions } from '@/lib/campaigns/manager-scope';
import {
  SELF_SERVICE_BONUS_BPS_CAP,
  SELF_SERVICE_FLAT_CENTS_CAP,
  SELF_SERVICE_PERCENT_BPS_CAP,
} from '@/lib/campaigns/create-campaign';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { createCampaignAction } from './actions';

interface NouvelleCampagnePageProps {
  searchParams: { erreur?: string; succes?: string };
}

export default async function NouvelleCampagnePage({
  searchParams,
}: NouvelleCampagnePageProps): Promise<JSX.Element> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  if (user.role !== 'team_manager' && user.role !== 'club_admin' && user.role !== 'platform_admin') {
    return (
      <main className="page">
        <div className="page-header">
          <h1>Nouvelle campagne</h1>
        </div>
        <Alert variant="error">
          Seul un responsable d&apos;équipe, un administrateur de club ou un administrateur de la
          plateforme peut créer une campagne.
        </Alert>
      </main>
    );
  }

  const supabase = createSupabaseServerClient();
  const [{ teams, clubs, athletes }, products] = await Promise.all([
    loadCampaignWizardOptions(supabase, user),
    listPublicProducts({}, createSupabaseProductRepo(supabase)),
  ]);

  return (
    <main className="page stack">
      <div className="page-header">
        <h1>Nouvelle campagne</h1>
        <p>Créez une campagne active en moins de 15 minutes : type, bénéficiaire, participants et packs.</p>
      </div>

      {searchParams.erreur ? <Alert variant="error">{searchParams.erreur}</Alert> : null}
      {searchParams.succes ? (
        <Alert variant="success">
          Campagne créée et active : <strong>{searchParams.succes}</strong>. Elle apparaît dès
          maintenant sur la page publique du bénéficiaire.
        </Alert>
      ) : null}

      <Card>
        <section className="stack stack--sm">
          <h2>Vos équipes</h2>
          {teams.length === 0 ? (
            <p>Aucune équipe gérée.</p>
          ) : (
            <ul>
              {teams.map((team) => (
                <li key={team.id}>
                  {team.name} — identifiant : <code>{team.id}</code>
                </li>
              ))}
            </ul>
          )}

          <h2>Vos clubs</h2>
          {clubs.length === 0 ? (
            <p>Aucun club géré.</p>
          ) : (
            <ul>
              {clubs.map((club) => (
                <li key={club.id}>
                  {club.name} — identifiant : <code>{club.id}</code>
                </li>
              ))}
            </ul>
          )}

          <h2>Athlètes de vos équipes</h2>
          {athletes.length === 0 ? (
            <p>Aucun athlète dans le périmètre géré.</p>
          ) : (
            <ul>
              {athletes.map((athlete) => (
                <li key={athlete.id}>
                  {athlete.firstName} {athlete.lastName} — identifiant : <code>{athlete.id}</code>
                </li>
              ))}
            </ul>
          )}
        </section>
      </Card>

      <Card>
        <form action={createCampaignAction} className="form form--wide stack">
          <section className="stack stack--sm">
            <h2>Informations générales</h2>

            <div className="form__row">
              <Field label="Nom de la campagne" required>
                <input type="text" name="name" required maxLength={200} />
              </Field>

              <Field label="Type de campagne" required>
                <select name="type" required defaultValue="team">
                  <option value="team">Équipe</option>
                  <option value="club">Club</option>
                  <option value="athlete">Athlète</option>
                  <option value="event">Événement</option>
                  <option value="annual">Annuelle</option>
                  <option value="reorder">Réapprovisionnement</option>
                </select>
              </Field>
            </div>

            <Field label="Message public (optionnel)">
              <textarea name="publicMessage" maxLength={2000} />
            </Field>

            <div className="form__row">
              <Field label="Objectif (en cents, optionnel)">
                <input type="number" name="goalCents" min={0} step={1} />
              </Field>

              <Field label="Date de début" required>
                <input type="datetime-local" name="startsAt" required />
              </Field>

              <Field label="Date de fin (optionnel)">
                <input type="datetime-local" name="endsAt" />
              </Field>
            </div>
          </section>

          <section className="stack stack--sm">
            <h2>Périmètre (au moins une équipe ou un club)</h2>

            <div className="form__row">
              <Field label="Identifiant de l'équipe rattachée (optionnel)">
                <input type="text" name="teamId" placeholder="UUID" />
              </Field>

              <Field label="Identifiant du club rattaché (optionnel)">
                <input type="text" name="clubId" placeholder="UUID" />
              </Field>
            </div>
          </section>

          <section className="stack stack--sm">
            <h2>Bénéficiaire</h2>
            <p>
              Pour un bénéficiaire équipe/club, l&apos;identifiant doit être identique à celui saisi
              ci-dessus.
            </p>

            <div className="form__row">
              <Field label="Type de bénéficiaire" required>
                <select name="beneficiaryType" required defaultValue="team">
                  <option value="team">Équipe</option>
                  <option value="club">Club</option>
                  <option value="athlete">Athlète</option>
                </select>
              </Field>

              <Field label="Identifiant du bénéficiaire" required>
                <input type="text" name="beneficiaryId" required placeholder="UUID" />
              </Field>
            </div>
          </section>

          <section className="stack stack--sm">
            <h2>Athlètes participants</h2>
            {athletes.length === 0 ? (
              <p>Aucun athlète disponible dans votre périmètre.</p>
            ) : (
              <div className="checkbox-list">
                {athletes.map((athlete) => (
                  <div key={athlete.id} className="checkbox-row">
                    <input
                      type="checkbox"
                      id={`participant-${athlete.id}`}
                      name="participantAthleteIds"
                      value={athlete.id}
                    />
                    <label htmlFor={`participant-${athlete.id}`}>
                      {athlete.firstName} {athlete.lastName}
                    </label>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="stack stack--sm">
            <h2>Packs inclus (au moins un requis)</h2>
            {products.length === 0 ? (
              <p>Aucun pack actif au catalogue.</p>
            ) : (
              <div className="checkbox-list">
                {products.map((product) => (
                  <div key={product.id} className="checkbox-row">
                    <input type="checkbox" id={`product-${product.id}`} name="productIds" value={product.id} />
                    <label htmlFor={`product-${product.id}`}>{product.name}</label>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="stack stack--sm">
            <h2>Règle de crédit de la campagne (optionnel)</h2>
            <p>
              Libre-service plafonné : taux et bonus maximum {SELF_SERVICE_PERCENT_BPS_CAP / 100} %,
              montant fixe maximum {SELF_SERVICE_FLAT_CENTS_CAP / 100} $. Laissez vide pour ne pas
              définir de règle propre à cette campagne (le crédit suivra alors la règle produit ou
              globale déjà en vigueur).
            </p>

            <div className="form__row">
              <Field label="Taux de crédit (points de base, ex. 1500 = 15 %)">
                <input type="number" name="creditPercentBps" min={0} max={SELF_SERVICE_PERCENT_BPS_CAP} step={1} />
              </Field>

              <Field label="Montant fixe (en cents)">
                <input type="number" name="creditFlatCents" min={0} step={1} />
              </Field>
            </div>

            <div className="form__row">
              <Field label="Sous-total minimum pour le bonus (en cents, optionnel)">
                <input type="number" name="creditMinBasketCents" min={0} step={1} />
              </Field>

              <Field label="Bonus de seuil (points de base, optionnel)">
                <input type="number" name="creditBonusPercentBps" min={0} max={SELF_SERVICE_BONUS_BPS_CAP} step={1} />
              </Field>
            </div>
          </section>

          <div className="form__actions">
            <Button type="submit">Créer et activer la campagne</Button>
          </div>
        </form>
      </Card>
    </main>
  );
}
