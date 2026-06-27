'use client';

import { useState } from 'react';
import { deleteSavedSplitAction, saveSplitAction, setBeneficiarySplitAction } from '@/app/(shop)/panier/actions';
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

/** Tâche 1.5.3 : une répartition favorite, déjà enrichie (libellé + statut
 * actif par bénéficiaire) par `lib/cart/saved-splits.ts#listSavedSplitsForUser`. */
export interface SavedSplitOption {
  id: string;
  name: string;
  items: Array<{
    beneficiaryType: 'athlete' | 'team' | 'club';
    beneficiaryId: string;
    label: string;
    shareBps: number;
    isActive: boolean;
  }>;
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
  /** Tâche 1.5.3 : répartitions favorites déjà enregistrées par ce client --
   * vide pour un invité (réservé aux clients connectés, voir
   * docs/prompts/phase-1-5.md). Optionnel pour ne pas casser les tests/
   * usages existants antérieurs à cette tâche. */
  savedSplits?: SavedSplitOption[];
  /** Tâche 1.5.3 : `true` uniquement pour un client connecté -- masque tout
   * le bloc "répartitions favorites" pour un invité plutôt que de l'afficher
   * désactivé (un invité n'a de toute façon jamais de panier persistant
   * multi-appareil, voir page panier). */
  canSaveSplits?: boolean;
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
export default function BeneficiarySplit({
  cartId,
  rows,
  totalCreditCents,
  savedSplits = [],
  canSaveSplits = false,
}: BeneficiarySplitProps): JSX.Element {
  const [editableRows, setEditableRows] = useState<EditableRow[]>(() => toEditableRows(rows));
  // Tâche 1.5.3 : avertissement non bloquant affiché après le CHARGEMENT
  // d'une répartition favorite référençant un bénéficiaire devenu inactif
  // (critère d'acceptation : « signalée à l'application », jamais bloquée
  // silencieusement -- le client reste libre de corriger puis d'enregistrer,
  // ou d'ignorer et enregistrer quand même).
  const [inactiveWarning, setInactiveWarning] = useState<string | null>(null);

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

  /**
   * Tâche 1.5.3 : « réapplique à un panier » -- remplace simplement les
   * lignes éditables par celles de la répartition favorite choisie. Aucun
   * aller-retour serveur ici : l'enregistrement final repasse par le bouton
   * "Enregistrer la répartition" existant, donc par la même validation
   * serveur qu'une répartition saisie à la main (`setCartBeneficiarySplit`),
   * jamais dupliquée.
   */
  function handleApplySavedSplit(savedSplitId: string): void {
    const savedSplit = savedSplits.find((candidate) => candidate.id === savedSplitId);
    if (!savedSplit) return;

    setEditableRows(
      savedSplit.items.map((item) => ({
        key: nextRowKey(),
        beneficiaryType: item.beneficiaryType,
        beneficiaryId: item.beneficiaryId,
        label: item.label,
        shareBps: item.shareBps,
      })),
    );

    const inactiveLabels = savedSplit.items.filter((item) => !item.isActive).map((item) => item.label);
    setInactiveWarning(
      inactiveLabels.length > 0
        ? `Attention : « ${savedSplit.name} » contient ${inactiveLabels.length > 1 ? 'des bénéficiaires inactifs' : 'un bénéficiaire inactif'} (${inactiveLabels.join(', ')}). Corrigez la répartition avant d'enregistrer si nécessaire.`
        : null,
    );
  }

  return (
    <div className="stack stack--sm">
      {canSaveSplits && savedSplits.length > 0 ? (
        <div className="stack stack--sm">
          <label htmlFor="saved-split-select">Charger une répartition favorite</label>
          <select
            id="saved-split-select"
            defaultValue=""
            onChange={(event) => {
              if (event.target.value) {
                handleApplySavedSplit(event.target.value);
              }
            }}
          >
            <option value="" disabled>
              Choisir...
            </option>
            {savedSplits.map((savedSplit) => (
              <option key={savedSplit.id} value={savedSplit.id}>
                {savedSplit.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {inactiveWarning ? <p role="alert">{inactiveWarning}</p> : null}

      <form action={setBeneficiarySplitAction}>
      <input type="hidden" name="cartId" value={cartId} />

      {editableRows.length === 0 ? (
        <p>Ajoutez un premier bénéficiaire pour commencer.</p>
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
        {editableRows.length === 0
          ? 'Choisissez qui vous voulez encourager, puis enregistrez.'
          : `Votre achat sera partagé entre ${editableRows.length} ${
              editableRows.length > 1 ? 'bénéficiaires' : 'bénéficiaire'
            }. Enregistrez pour confirmer.`}
      </p>

      <Button type="submit" disabled={editableRows.length === 0}>
        Enregistrer la répartition
      </Button>
      </form>

      {canSaveSplits ? (
        <form action={saveSplitAction} className="stack stack--sm">
          {editableRows.map((row) => (
            <span key={row.key}>
              <input type="hidden" name="beneficiaryType" value={row.beneficiaryType} />
              <input type="hidden" name="beneficiaryId" value={row.beneficiaryId} />
              <input type="hidden" name="shareBps" value={row.shareBps} />
            </span>
          ))}
          <label htmlFor="saved-split-name">Enregistrer cette répartition sous un nom</label>
          <input
            id="saved-split-name"
            type="text"
            name="savedSplitName"
            placeholder="ex. Thomas et Emma"
            maxLength={80}
            required
          />
          <Button type="submit" variant="outline" size="sm" disabled={editableRows.length === 0}>
            Enregistrer comme répartition favorite
          </Button>
        </form>
      ) : null}

      {canSaveSplits && savedSplits.length > 0 ? (
        <div className="stack stack--sm">
          <h3>Mes répartitions favorites</h3>
          <ul>
            {savedSplits.map((savedSplit) => (
              <li key={savedSplit.id}>
                {savedSplit.name}
                <form action={deleteSavedSplitAction} style={{ display: 'inline' }}>
                  <input type="hidden" name="savedSplitId" value={savedSplit.id} />
                  <Button type="submit" variant="outline" size="sm">
                    Supprimer
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
