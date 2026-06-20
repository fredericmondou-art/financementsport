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
      <main>
        <h1>Nouvelle campagne</h1>
        <p role="alert">
          Seul un responsable d&apos;équipe, un administrateur de club ou un administrateur de la
          plateforme peut créer une campagne.
        </p>
      </main>
    );
  }

  const supabase = createSupabaseServerClient();
  const [{ teams, clubs, athletes }, products] = await Promise.all([
    loadCampaignWizardOptions(supabase, user),
    listPublicProducts({}, createSupabaseProductRepo(supabase)),
  ]);

  return (
    <main>
      <h1>Nouvelle campagne</h1>
      <p>Créez une campagne active en moins de 15 minutes : type, bénéficiaire, participants et packs.</p>

      {searchParams.erreur ? <p role="alert">{searchParams.erreur}</p> : null}
      {searchParams.succes ? (
        <p role="status">
          Campagne créée et active : <strong>{searchParams.succes}</strong>. Elle apparaît dès
          maintenant sur la page publique du bénéficiaire.
        </p>
      ) : null}

      <section>
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

      <form action={createCampaignAction}>
        <h2>Informations générales</h2>

        <label htmlFor="name">Nom de la campagne</label>
        <input id="name" type="text" name="name" required maxLength={200} />

        <label htmlFor="type">Type de campagne</label>
        <select id="type" name="type" required defaultValue="team">
          <option value="team">Équipe</option>
          <option value="club">Club</option>
          <option value="athlete">Athlète</option>
          <option value="event">Événement</option>
          <option value="annual">Annuelle</option>
          <option value="reorder">Réapprovisionnement</option>
        </select>

        <label htmlFor="publicMessage">Message public (optionnel)</label>
        <textarea id="publicMessage" name="publicMessage" maxLength={2000} />

        <label htmlFor="goalCents">Objectif (en cents, optionnel)</label>
        <input id="goalCents" type="number" name="goalCents" min={0} step={1} />

        <label htmlFor="startsAt">Date de début</label>
        <input id="startsAt" type="datetime-local" name="startsAt" required />

        <label htmlFor="endsAt">Date de fin (optionnel)</label>
        <input id="endsAt" type="datetime-local" name="endsAt" />

        <h2>Périmètre (au moins une équipe ou un club)</h2>

        <label htmlFor="teamId">Identifiant de l&apos;équipe rattachée (optionnel)</label>
        <input id="teamId" type="text" name="teamId" placeholder="UUID" />

        <label htmlFor="clubId">Identifiant du club rattaché (optionnel)</label>
        <input id="clubId" type="text" name="clubId" placeholder="UUID" />

        <h2>Bénéficiaire</h2>
        <p>
          Pour un bénéficiaire équipe/club, l&apos;identifiant doit être identique à celui saisi
          ci-dessus.
        </p>

        <label htmlFor="beneficiaryType">Type de bénéficiaire</label>
        <select id="beneficiaryType" name="beneficiaryType" required defaultValue="team">
          <option value="team">Équipe</option>
          <option value="club">Club</option>
          <option value="athlete">Athlète</option>
        </select>

        <label htmlFor="beneficiaryId">Identifiant du bénéficiaire</label>
        <input id="beneficiaryId" type="text" name="beneficiaryId" required placeholder="UUID" />

        <h2>Athlètes participants</h2>
        {athletes.length === 0 ? (
          <p>Aucun athlète disponible dans votre périmètre.</p>
        ) : (
          athletes.map((athlete) => (
            <div key={athlete.id}>
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
          ))
        )}

        <h2>Packs inclus (au moins un requis)</h2>
        {products.length === 0 ? (
          <p>Aucun pack actif au catalogue.</p>
        ) : (
          products.map((product) => (
            <div key={product.id}>
              <input
                type="checkbox"
                id={`product-${product.id}`}
                name="productIds"
                value={product.id}
              />
              <label htmlFor={`product-${product.id}`}>{product.name}</label>
            </div>
          ))
        )}

        <h2>Règle de crédit de la campagne (optionnel)</h2>
        <p>
          Libre-service plafonné : taux et bonus maximum {SELF_SERVICE_PERCENT_BPS_CAP / 100} %,
          montant fixe maximum {SELF_SERVICE_FLAT_CENTS_CAP / 100} $. Laissez vide pour ne pas
          définir de règle propre à cette campagne (le crédit suivra alors la règle produit ou
          globale déjà en vigueur).
        </p>

        <label htmlFor="creditPercentBps">Taux de crédit (points de base, ex. 1500 = 15 %)</label>
        <input
          id="creditPercentBps"
          type="number"
          name="creditPercentBps"
          min={0}
          max={SELF_SERVICE_PERCENT_BPS_CAP}
          step={1}
        />

        <label htmlFor="creditFlatCents">Montant fixe (en cents)</label>
        <input id="creditFlatCents" type="number" name="creditFlatCents" min={0} step={1} />

        <label htmlFor="creditMinBasketCents">Sous-total minimum pour le bonus (en cents, optionnel)</label>
        <input id="creditMinBasketCents" type="number" name="creditMinBasketCents" min={0} step={1} />

        <label htmlFor="creditBonusPercentBps">Bonus de seuil (points de base, optionnel)</label>
        <input
          id="creditBonusPercentBps"
          type="number"
          name="creditBonusPercentBps"
          min={0}
          max={SELF_SERVICE_BONUS_BPS_CAP}
          step={1}
        />

        <button type="submit">Créer et activer la campagne</button>
      </form>
    </main>
  );
}
