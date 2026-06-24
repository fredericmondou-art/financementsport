/**
 * Message pré-rédigé à l'intention des parents (Tâche 1.6.B3, écran
 * "prochaines actions" après activation). Le cahier exige que ce message
 * soit copiable EN UN CLIC, "rien à rédiger" : généré entièrement ici,
 * jamais laissé à la responsable à compléter elle-même. Fonction pure,
 * AUCUNE dépendance I/O -- testable directement (CLAUDE.md section 6/8).
 *
 * Toujours en français (CLAUDE.md section 2, interface par défaut). Un seul
 * gabarit pour les 3 types de bénéficiaire (équipe/club/athlète) : le nom du
 * bénéficiaire suffit à rendre le message naturel dans les 3 cas
 * ("L'équipe X lance...", "Le Club Y lance...", "Jean Tremblay lance...") --
 * voir docs/DECISIONS.md pour ce choix d'un gabarit unique plutôt que 3
 * variantes.
 */
export interface ParentMessageInput {
  beneficiaryName: string;
  campaignName: string;
  publicUrl: string;
}

export function buildParentMessage({ beneficiaryName, campaignName, publicUrl }: ParentMessageInput): string {
  return [
    'Bonjour,',
    '',
    `${beneficiaryName} lance une campagne de financement : « ${campaignName} ».`,
    '',
    `Vous pouvez l'encourager directement ici : ${publicUrl}`,
    '',
    `Chaque achat permet d'amasser des fonds pour ${beneficiaryName}. Merci de votre soutien !`,
  ].join('\n');
}
