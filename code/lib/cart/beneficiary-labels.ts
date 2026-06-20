/**
 * Noms d'affichage des bénéficiaires (Tâche 1.4), pour le message obligatoire
 * « Votre achat générera X $ pour [bénéficiaire]. ».
 *
 * Respecte `athletes.hide_last_name` (CLAUDE.md section 5 : "Ne jamais
 * exposer à anon une donnée d'athlète marquée masquée") — un panier peut
 * être consulté par un invité non authentifié, donc traité comme une
 * surface PUBLIQUE pour cette règle précise, même si l'achat lui-même reste
 * privé. `hide_amounts`/`hide_photo`/`hide_city`/`show_team_only` ne
 * s'appliquent PAS ici : ces masquages concernent l'affichage PUBLIC du
 * profil/progrès de l'athlète (Tâche 1.6), pas le message de confirmation
 * montré à l'acheteur qui dirige lui-même ce don précis vers ce bénéficiaire
 * — décision autonome, voir docs/DECISIONS.md.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BeneficiaryType } from '@/lib/db/types';

interface AthleteNameRow {
  id: string;
  first_name: string;
  last_name: string;
  hide_last_name: boolean;
}

/** Fonction PURE : applique la règle `hide_last_name` (prénom + initiale si
 * masqué, comme documenté sur la colonne dans le schéma). */
export function formatAthleteDisplayName(athlete: AthleteNameRow): string {
  if (athlete.hide_last_name) {
    return `${athlete.first_name} ${athlete.last_name.charAt(0)}.`;
  }
  return `${athlete.first_name} ${athlete.last_name}`;
}

export function beneficiaryLabelKey(beneficiaryType: BeneficiaryType, beneficiaryId: string): string {
  return `${beneficiaryType}:${beneficiaryId}`;
}

/** Charge les noms d'affichage de plusieurs bénéficiaires polymorphes en une
 * requête par type (athlète/équipe/club), indexés par
 * `beneficiaryLabelKey`. */
export async function loadBeneficiaryLabels(
  supabase: SupabaseClient,
  beneficiaries: Array<{ beneficiaryType: BeneficiaryType; beneficiaryId: string }>,
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  const idsByType: Record<BeneficiaryType, string[]> = { athlete: [], team: [], club: [] };
  for (const beneficiary of beneficiaries) {
    idsByType[beneficiary.beneficiaryType].push(beneficiary.beneficiaryId);
  }

  const athleteIds = [...new Set(idsByType.athlete)];
  if (athleteIds.length > 0) {
    const { data, error } = await supabase
      .from('athletes')
      .select('id, first_name, last_name, hide_last_name')
      .in('id', athleteIds);
    if (error) throw error;
    for (const row of (data as AthleteNameRow[]) ?? []) {
      labels.set(beneficiaryLabelKey('athlete', row.id), formatAthleteDisplayName(row));
    }
  }

  const teamIds = [...new Set(idsByType.team)];
  if (teamIds.length > 0) {
    const { data, error } = await supabase.from('teams').select('id, name').in('id', teamIds);
    if (error) throw error;
    for (const row of (data as Array<{ id: string; name: string }>) ?? []) {
      labels.set(beneficiaryLabelKey('team', row.id), row.name);
    }
  }

  const clubIds = [...new Set(idsByType.club)];
  if (clubIds.length > 0) {
    const { data, error } = await supabase.from('clubs').select('id, name').in('id', clubIds);
    if (error) throw error;
    for (const row of (data as Array<{ id: string; name: string }>) ?? []) {
      labels.set(beneficiaryLabelKey('club', row.id), row.name);
    }
  }

  return labels;
}
