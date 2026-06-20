import { setBeneficiarySplitAction } from '@/app/(shop)/panier/actions';

export interface BeneficiarySplitRow {
  beneficiaryType: 'athlete' | 'team' | 'club';
  beneficiaryId: string;
  label: string;
  shareBps: number;
}

interface BeneficiarySplitProps {
  cartId: string;
  rows: BeneficiarySplitRow[];
}

const EMPTY_EXTRA_ROWS = 2;

/**
 * Formulaire de répartition entre bénéficiaires (Tâche 1.4). Server
 * Component pur (formulaire natif + Server Action), même approche que
 * app/(auth)/login -- pas de JS côté client.
 *
 * Le champ "part" est saisi directement en POINTS DE BASE (10000 = 100 %),
 * exactement la représentation stockée en base (`share_bps`) et validée par
 * `assertSplitTotals10000`. On évite volontairement toute conversion
 * pourcentage <-> points de base côté serveur : CLAUDE.md section 4 interdit
 * le flottant pour l'argent, et même si `share_bps` n'est pas un montant en
 * cents, on garde la même discipline (aucune multiplication/division
 * flottante sur une valeur qui doit ensuite être validée à l'entier exact).
 *
 * La sélection d'un bénéficiaire se fait par id (UUID) saisi directement :
 * un sélecteur de recherche par nom est hors scope ici (les pages publiques
 * athlète/équipe/club de la Tâche 1.6 fourniront normalement l'id déjà
 * rempli via un lien "Soutenir cet athlète"). On affiche toujours quelques
 * lignes vides en plus des lignes existantes pour permettre d'ajouter un
 * second (ou troisième) bénéficiaire sans JS, conformément au cas
 * d'acceptation "répartir entre deux enfants".
 */
export default function BeneficiarySplit({ cartId, rows }: BeneficiarySplitProps): JSX.Element {
  const totalBps = rows.reduce((sum, row) => sum + row.shareBps, 0);

  return (
    <form action={setBeneficiarySplitAction}>
      <input type="hidden" name="cartId" value={cartId} />

      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Identifiant du bénéficiaire</th>
            <th>Bénéficiaire</th>
            <th>Part (points de base, 10000 = 100 %)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.beneficiaryType}:${row.beneficiaryId}`}>
              <td>
                <select name="beneficiaryType" defaultValue={row.beneficiaryType}>
                  <option value="athlete">Athlète</option>
                  <option value="team">Équipe</option>
                  <option value="club">Club</option>
                </select>
              </td>
              <td>
                <input type="text" name="beneficiaryId" defaultValue={row.beneficiaryId} />
              </td>
              <td>{row.label}</td>
              <td>
                <input type="number" name="shareBps" defaultValue={row.shareBps} min={0} max={10000} step={1} />
              </td>
            </tr>
          ))}
          {Array.from({ length: EMPTY_EXTRA_ROWS }).map((_, index) => (
            <tr key={`vide-${index}`}>
              <td>
                <select name="beneficiaryType" defaultValue="athlete">
                  <option value="athlete">Athlète</option>
                  <option value="team">Équipe</option>
                  <option value="club">Club</option>
                </select>
              </td>
              <td>
                <input type="text" name="beneficiaryId" placeholder="Identifiant (UUID)" />
              </td>
              <td>—</td>
              <td>
                <input type="number" name="shareBps" defaultValue={0} min={0} max={10000} step={1} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p>
        Total actuel : {totalBps} / 10000 ({(totalBps / 100).toFixed(2)} %) — doit être exactement 10000
        pour enregistrer. Les lignes vides ou à 0 sont ignorées.
      </p>

      <button type="submit">Enregistrer la répartition</button>
    </form>
  );
}
