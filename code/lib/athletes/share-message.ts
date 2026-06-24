/**
 * Message pré-rédigé pour le partage en un clic du lien personnel de
 * l'athlète (Tâche 1.6.C2, page de suivi). Même exigence que le message de
 * démarrage de campagne (`lib/campaigns/demarrage-message.ts#buildParentMessage`,
 * Tâche 1.6.B3) : "rien à rédiger", le texte est copiable tel quel. Fonction
 * pure, aucune dépendance I/O -- testable directement (CLAUDE.md section 6/8).
 *
 * Volontairement à la TROISIÈME PERSONNE ("X amasse des fonds..."), jamais à
 * la première personne ("J'amasse des fonds...") : cette page de suivi est
 * accessible à l'athlète mineur lui-même (lecture seule, même permission que
 * `getAthlete`), mais CLAUDE.md section 5 exige que toute communication
 * impliquant un mineur passe par le cadre parental -- le gabarit ne doit donc
 * jamais produire un texte qui se lit comme rédigé et envoyé personnellement
 * par l'enfant. Un seul gabarit pour tous les bénéficiaires (athlète/équipe/
 * club), même choix que `buildParentMessage` -- voir docs/DECISIONS.md.
 *
 * Séparé de `buildParentMessage` plutôt que réutilisé : ce message-ci
 * accompagne un suivi de progression DÉJÀ en cours (ton "amasse des fonds",
 * sans notion de lancement) alors que `buildParentMessage` annonce le
 * démarrage d'une toute nouvelle campagne -- deux moments différents du
 * cahier des charges (Tâche 1.6.B3 vs 1.6.C2), pas un doublon accidentel.
 */
export interface AthleteShareMessageInput {
  beneficiaryName: string;
  campaignName: string;
  publicUrl: string;
}

export function buildAthleteShareMessage({
  beneficiaryName,
  campaignName,
  publicUrl,
}: AthleteShareMessageInput): string {
  return [
    'Bonjour,',
    '',
    `${beneficiaryName} amasse des fonds grâce à la campagne « ${campaignName} ».`,
    '',
    `Vous pouvez encourager directement ici : ${publicUrl}`,
    '',
    'Merci de votre soutien !',
  ].join('\n');
}
