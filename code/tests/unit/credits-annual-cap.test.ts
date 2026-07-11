/**
 * Tests unitaires du plafond annuel de crédit par athlète (R8,
 * SPEC-PARAMETRES-PLATEFORME.md §4, Tâche P.5) : `lib/credits/annual-cap.ts`.
 * CLAUDE.md section 8 : « aucune fonctionnalité touchant l'argent n'est
 * considérée "faite" sans tests qui couvrent les cas limites » -- ce fichier
 * couvre explicitement les bornes max-1/max/max+1 exigées par le plan P.8.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  applyAnnualCreditCap,
  buildAnnualCapAdminNoteFr,
  summarizeAnnualCapExcess,
  type AnnualCreditTotalsByAthlete,
} from '@/lib/credits/annual-cap';
import type { OrderCreditInsertPayload } from '@/lib/credits/persist';

const MAX_CENTS = 200000; // 2000 $ (valeur seed réelle, lib/parametres.ts)

function makeInsert(overrides: Partial<OrderCreditInsertPayload> = {}): OrderCreditInsertPayload {
  return {
    beneficiary_type: 'athlete',
    beneficiary_id: randomUUID(),
    campaign_id: null,
    amount_cents: 1000,
    status: 'active',
    applied_rule_id: null,
    computation_note: 'note',
    pending_reason: null,
    ...overrides,
  };
}

describe('applyAnnualCreditCap', () => {
  it('ne modifie rien quand aucun total antérieur + crédit ne dépasse le plafond (sous le max)', () => {
    const insert = makeInsert({ amount_cents: 1000 });
    const totals: AnnualCreditTotalsByAthlete = new Map([[insert.beneficiary_id, MAX_CENTS - 1001]]);

    const result = applyAnnualCreditCap([insert], totals, MAX_CENTS);

    expect(result).toEqual([insert]);
  });

  it('borne exacte : total antérieur + crédit === max --> reste entièrement actif (pas un dépassement)', () => {
    const insert = makeInsert({ amount_cents: 1000 });
    const totals: AnnualCreditTotalsByAthlete = new Map([[insert.beneficiary_id, MAX_CENTS - 1000]]);

    const result = applyAnnualCreditCap([insert], totals, MAX_CENTS);

    expect(result).toEqual([insert]);
  });

  it('borne max+1 : total antérieur + crédit dépasse le max d’un seul centime --> scinde 999/1', () => {
    const insert = makeInsert({ amount_cents: 1000 });
    const totals: AnnualCreditTotalsByAthlete = new Map([[insert.beneficiary_id, MAX_CENTS - 999]]);

    const result = applyAnnualCreditCap([insert], totals, MAX_CENTS);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ amount_cents: 999, status: 'active', pending_reason: null });
    expect(result[1]).toMatchObject({
      amount_cents: 1,
      status: 'pending',
      pending_reason: 'plafond_annuel',
      beneficiary_id: insert.beneficiary_id,
    });
    // Le total réparti reste identique au montant calculé -- aucun argent perdu.
    expect(result[0]!.amount_cents + result[1]!.amount_cents).toBe(insert.amount_cents);
  });

  it('plafond déjà entièrement consommé --> tout le crédit devient excédent (aucune ligne à 0 centime)', () => {
    const insert = makeInsert({ amount_cents: 1000 });
    const totals: AnnualCreditTotalsByAthlete = new Map([[insert.beneficiary_id, MAX_CENTS]]);

    const result = applyAnnualCreditCap([insert], totals, MAX_CENTS);

    expect(result).toEqual([
      { ...insert, status: 'pending', pending_reason: 'plafond_annuel' },
    ]);
  });

  it('plafond dépassé avant même ce crédit (total antérieur > max) --> tout le crédit devient excédent', () => {
    const insert = makeInsert({ amount_cents: 1000 });
    const totals: AnnualCreditTotalsByAthlete = new Map([[insert.beneficiary_id, MAX_CENTS + 50000]]);

    const result = applyAnnualCreditCap([insert], totals, MAX_CENTS);

    expect(result).toEqual([
      { ...insert, status: 'pending', pending_reason: 'plafond_annuel' },
    ]);
  });

  it('aucun total antérieur connu (première commande de l’année) --> traité comme 0 $ déjà attribué', () => {
    const insert = makeInsert({ amount_cents: 1000 });
    const totals: AnnualCreditTotalsByAthlete = new Map();

    const result = applyAnnualCreditCap([insert], totals, MAX_CENTS);

    expect(result).toEqual([insert]);
  });

  it("n'affecte jamais un bénéficiaire 'team' ou 'club' -- le plafond ne vise que les athlètes (spec R8)", () => {
    const teamInsert = makeInsert({ beneficiary_type: 'team', amount_cents: 999999 });
    const clubInsert = makeInsert({ beneficiary_type: 'club', amount_cents: 999999 });
    const totals: AnnualCreditTotalsByAthlete = new Map([
      [teamInsert.beneficiary_id, MAX_CENTS * 10],
      [clubInsert.beneficiary_id, MAX_CENTS * 10],
    ]);

    const result = applyAnnualCreditCap([teamInsert, clubInsert], totals, MAX_CENTS);

    expect(result).toEqual([teamInsert, clubInsert]);
  });

  it("ne re-scinde jamais une ligne déjà 'pending' (ex. campagne_inactive) -- seules les lignes 'active' sont examinées", () => {
    const insert = makeInsert({
      amount_cents: 999999,
      status: 'pending',
      pending_reason: 'campagne_inactive',
    });
    const totals: AnnualCreditTotalsByAthlete = new Map([[insert.beneficiary_id, MAX_CENTS * 10]]);

    const result = applyAnnualCreditCap([insert], totals, MAX_CENTS);

    expect(result).toEqual([insert]);
  });

  it('ignore les lignes à 0 centime (aucune ligne fantôme à 0 $ produite)', () => {
    const insert = makeInsert({ amount_cents: 0 });
    const totals: AnnualCreditTotalsByAthlete = new Map([[insert.beneficiary_id, MAX_CENTS]]);

    const result = applyAnnualCreditCap([insert], totals, MAX_CENTS);

    expect(result).toEqual([insert]);
  });

  it('traite plusieurs bénéficiaires athlètes de la même commande indépendamment (répartition multi-bénéficiaires)', () => {
    const underCap = makeInsert({ amount_cents: 500 });
    const overCap = makeInsert({ amount_cents: 500 });
    const totals: AnnualCreditTotalsByAthlete = new Map([
      [underCap.beneficiary_id, 0],
      [overCap.beneficiary_id, MAX_CENTS - 100],
    ]);

    const result = applyAnnualCreditCap([underCap, overCap], totals, MAX_CENTS);

    expect(result).toHaveLength(3); // underCap inchangé + overCap scindé en 2
    expect(result.find((r) => r.beneficiary_id === underCap.beneficiary_id)).toEqual(underCap);
    const overCapParts = result.filter((r) => r.beneficiary_id === overCap.beneficiary_id);
    expect(overCapParts).toHaveLength(2);
    expect(overCapParts.reduce((sum, r) => sum + r.amount_cents, 0)).toBe(500);
  });

  it("préserve l'ordre relatif et ne perd/duplique aucun centime sur un jeu de lignes mixte", () => {
    const inserts = [
      makeInsert({ amount_cents: 100 }),
      makeInsert({ beneficiary_type: 'team', amount_cents: 50000 }),
      makeInsert({ amount_cents: 500 }),
    ];
    const totalBefore = inserts.reduce((sum, i) => sum + i.amount_cents, 0);
    const totals: AnnualCreditTotalsByAthlete = new Map([
      [inserts[0]!.beneficiary_id, MAX_CENTS - 50],
      [inserts[2]!.beneficiary_id, 0],
    ]);

    const result = applyAnnualCreditCap(inserts, totals, MAX_CENTS);

    expect(result.reduce((sum, i) => sum + i.amount_cents, 0)).toBe(totalBefore);
  });
});

describe('summarizeAnnualCapExcess', () => {
  it('ne retient que les lignes athlete/pending/plafond_annuel', () => {
    const excess = makeInsert({ status: 'pending', pending_reason: 'plafond_annuel', amount_cents: 300 });
    const untouched = makeInsert({ status: 'active' });
    const otherPending = makeInsert({ status: 'pending', pending_reason: 'campagne_inactive' });
    const teamExcess = makeInsert({
      beneficiary_type: 'team',
      status: 'pending',
      pending_reason: 'plafond_annuel',
    });

    const result = summarizeAnnualCapExcess([excess, untouched, otherPending, teamExcess]);

    expect(result).toEqual([{ beneficiaryId: excess.beneficiary_id, excessCents: 300 }]);
  });

  it('retourne un tableau vide si aucune ligne en excédent', () => {
    expect(summarizeAnnualCapExcess([makeInsert({ status: 'active' })])).toEqual([]);
  });
});

describe('buildAnnualCapAdminNoteFr', () => {
  it('retourne null si aucun excédent (pas de note inutile)', () => {
    expect(buildAnnualCapAdminNoteFr([])).toBeNull();
  });

  it('formate un montant en dollars et mentionne le motif plafond_annuel', () => {
    const athleteId = randomUUID();
    const note = buildAnnualCapAdminNoteFr([{ beneficiaryId: athleteId, excessCents: 1250 }]);
    expect(note?.toLowerCase()).toContain('plafond');
    expect(note).toContain(athleteId);
    expect(note).toContain('12.50');
  });

  it('inclut chaque athlète distinct quand plusieurs excédents sont notifiés ensemble', () => {
    const a1 = randomUUID();
    const a2 = randomUUID();
    const note = buildAnnualCapAdminNoteFr([
      { beneficiaryId: a1, excessCents: 100 },
      { beneficiaryId: a2, excessCents: 200 },
    ]);
    expect(note).toContain(a1);
    expect(note).toContain(a2);
  });
});
