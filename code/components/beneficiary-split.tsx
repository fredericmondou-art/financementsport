'use client';

import { useState } from 'react';
import { setBeneficiarySplitAction } from '@/app/(shop)/panier/actions';
import { splitCreditAmongBeneficiaries } from '@/lib/credits/calculate';
import { equalSplitBps, splitBpsEqually } from '@/lib/cart/beneficiaries';
import { formatCents } from '@/lib/format-cents';
import { Button } from '@/components/ui/button';

export interface BeneficiarySplitRow {
  beneficiaryType: 'athlete' | 'team' | 'club';
  beneficiaryId: string;
  label: string;
  shareBps: number;
}

interface BeneficiarySplitProps {
  cartId: string;
  rows: BeneficiarySplitRow[];
  /** Crédit total estimé du panier (`lib/cart/estimate-credit.ts`), requis
   * pour afficher l'impact par bénéficiaire EN DIRECT (Tâche 1.6.A4) sans
   * dupliquer le calcul : on appelle directement
   * `splitCreditAmongBeneficiaries` (lib/credits/calculate.ts), exactement la
   * même fonction que le serveur réappliquera après enregistrement de la
   * répartition. */
  totalCreditCents: number;
}

interface EditableRow {
  key: string;
  beneficiaryType: 'athlete' | 'team' | 'club';
  beneficiaryId: string;
  label: string;
  shareBps: number;
}

let rowKeySeq = 0;
function nextRowKey(): string {
  rowKeySeq += 1;
  return `split-row-${rowKeySeq}`;
}

function toEditableRows(rows: BeneficiarySplitRow[]): EditableRow[] {
  return rows.map((row) => ({ ...row, key: nextRowKey() }));
}

/**
 * Formulaire de répartition entre bénéficiaires (Tâche 1.4), simplifié à la
 * Tâche 1.6.A4 (docs/prompts/phase-1-6.md) : « choisir plusieurs enfants,
 * répartir également par défaut (50/50, 33/33/33…), ajuster simplement si
 * désiré, et voir l'impact par enfant en direct ».
 *
 * Devenu un Client Component (contrairement à la version Tâche 1.4, qui
 * était un formulaire 100 % natif sans JS) : l'égalisation automatique et
 * l'impact en direct exigent un état local recalculé à chaque interaction,
 * avant tout aller-retour serveur. La soumission finale reste inchangée --
 * même Server Action (`setBeneficiarySplitAction`), même contrat de
 * FormData (tableaux parallèles beneficiaryType[]/beneficiaryId[]/
 * shareBps[]) -- et AUCUNE validation n'est dupliquée ici : `equalSplitBps`/
 * `splitBpsEqually` (nouveaux, lib/cart/beneficiaries.ts) ne font que de
 * l'arithmétique de répartition égale ; la règle « somme = 10000 » reste
 * exclusivement dans `assertSplitTotals10000`, appelée côté serveur par
 * `setCartBeneficiarySplit` (défense en profondeur déjà en place avant cette
 * tâche, jamais reproduite ici).
 */
export default function BeneficiarySplit({ cartId, rows, totalCreditCents }: BeneficiarySplitProps): JSX.Element {
  const [editableRows, setEditableRows] = useState<EditableRow[]>(() => toEditableRows(rows));

  const liveImpact = splitCreditAmongBeneficiaries(
    totalCreditCents,
    editableRows.map((row) => ({
      beneficiaryType: row.beneficiaryType,
      beneficiaryId: row.beneficiaryId,
      shareBps: row.shareBps,
    })),
  );

  function equalizeAll(nextRows: EditableRow[]): EditableRow[] {
    if (nextRows.length === 0) {
      return nextRows;
    }
    // Redescendre à un seul bénéficiaire (après un retrait) doit le remettre
    // explicitement à 100 % -- sinon sa `shareBps` reste figée sur son
    // ancienne valeur (ex. 7000) alors que l'affichage montre déjà "100%"
    // pour une seule ligne (voir JSX ci-dessous), ce qui désynchronise
    // l'impact en direct du total réellement soumis au serveur. Bug trouvé
    // par tests/unit/beneficiary-split.test.tsx (« retirer un bénéficiaire
    // réégalise les lignes restantes »).
    if (nextRows.length === 1) {
      const [onlyRow] = nextRows;
      return onlyRow ? [{ ...onlyRow, shareBps: 10000 }] : nextRows;
    }
    const equalShares = equalSplitBps(nextRows.length);
    return nextRows.map((row, index) => ({ ...row, shareBps: equalShares[index] ?? 0 }));
  }

  /** Critère d'acceptation : "Ajouter un 2e enfant bascule automatiquement en
   * 50/50." -- déclenché dès l'ajout de la ligne, avant même la saisie de son
   * identifiant (la prévisualisation de l'impact ci-dessous reflète déjà la
   * nouvelle répartition). */
  function handleAddRow(): void {
    setEditableRows((current) =>
      equalizeAll([
        ...current,
        {
          key: nextRowKey(),
          beneficiaryType: 'athlete',
          beneficiaryId: '',
          label: 'Nouveau bénéficiaire',
          shareBps: current.length === 0 ? 10000 : 0,
        },
      ]),
    );
  }

  function handleRemoveRow(key: string): void {
    setEditableRows((current) => {
      if (current.length <= 1) {
        return current;
      }
      return equalizeAll(current.filter((row) => row.key !== key));
    });
  }

  /** Ajustement simple (Tâche 1.6.A4) : on fixe la part de CETTE ligne en
   * pourcentage, puis on redistribue également le reliquat entre les AUTRES
   * lignes -- le total reste ainsi toujours forcé à 100 %, sans jamais
   * laisser l'utilisateur atteindre un état invalide dans ce formulaire. */
  function handlePercentChange(key: string, rawPercent: number): void {
    setEditableRows((current) => {
      const clampedPercent = Math.max(0, Math.min(100, Math.round(rawPercent)));
      const nextBps = clampedPercent * 100;
      const others = current.filter((row) => row.key !== key);
      const otherShares = splitBpsEqually(10000 - nextBps, others.length);
      let otherIndex = 0;
      return current.map((row) => {
        if (row.key === key) {
          return { ...row, shareBps: nextBps };
        }
        const value = otherShares[otherIndex] ?? 0;
        otherIndex += 1;
        return { ...row, shareBps: value };
      });
    });
  }

  function handleIdentityChange(key: string, field: 'beneficiaryType' | 'beneficiaryId', value: string): void {
    setEditableRows((current) => current.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  }

  return (
    <form action={setBeneficiarySplitAction}>
      <input type="hidden" name="cartId" value={cartId} />

      {editableRows.length === 0 ? (
        <p>Aucun bénéficiaire pour le moment.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Identifiant du bénéficiaire</th>
                <th>Bénéficiaire</th>
                <th>Part</th>
                <th>Impact estimé</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {editableRows.map((row, index) => (
                <tr key={row.key}>
                  <td>
                    <input type="hidden" name="beneficiaryType" value={row.beneficiaryType} />
                    <select
                      aria-label="Type de bénéficiaire"
                      value={row.beneficiaryType}
                      onChange={(event) => handleIdentityChange(row.key, 'beneficiaryType', event.target.value)}
                    >
                      <option value="athlete">Athlète</option>
                      <option value="team">Équipe</option>
                      <option value="club">Club</option>
                    </select>
                  </td>
                  <td>
                    <input type="hidden" name="beneficiaryId" value={row.beneficiaryId} />
                    <input
                      type="text"
                      aria-label="Identifiant du bénéficiaire"
                      placeholder="UUID du bénéficiaire"
                      value={row.beneficiaryId}
                      onChange={(event) => handleIdentityChange(row.key, 'beneficiaryId', event.target.value)}
                    />
                  </td>
                  <td>{row.label}</td>
                  <td>
                    <input type="hidden" name="shareBps" value={row.shareBps} />
                    {editableRows.length < 2 ? (
                      <span>100%</span>
                    ) : (
                      <>
                        <input
                          type="number"
                          aria-label={`Part (%) pour ${row.label}`}
                          min={0}
                          max={100}
                          step={1}
                          value={Math.round(row.shareBps / 100)}
                          onChange={(event) => handlePercentChange(row.key, Number(event.target.value))}
                        />
                        <span>{Math.round(row.shareBps / 100)}%</span>
                      </>
                    )}
                  </td>
                  <td>{formatCents(liveImpact[index]?.amountCents ?? 0)}</td>
                  <td>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={editableRows.length <= 1}
                      onClick={() => handleRemoveRow(row.key)}
                    >
                      Retirer
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Button type="button" variant="outline" size="sm" onClick={handleAddRow}>
        Ajouter un bénéficiaire
      </Button>

      <p>
        Répartition actuelle : 100 % entre {editableRows.length}{' '}
        {editableRows.length > 1 ? 'bénéficiaires' : 'bénéficiaire'} -- enregistrez pour confirmer.
      </p>

      <Button type="submit" disabled={editableRows.length === 0}>
        Enregistrer la répartition
      </Button>
    </form>
  );
}
