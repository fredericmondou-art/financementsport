/**
 * Barre d'actions « Revenir » / « Continuer » de l'assistant de campagne
 * (Tâche 1.6.B1). Server Component pur — `Revenir` est un simple lien
 * (`?etape=N-1`, jamais de perte de données puisque l'étape précédente a déjà
 * été enregistrée côté serveur) et `Continuer` est le bouton de soumission
 * natif du `<form>` de l'étape (aucun JS requis, cohérent avec CLAUDE.md
 * section 6 et le reste de l'assistant).
 *
 * Critère d'acceptation : « boutons toujours visibles, atteignables au
 * pouce » — `position: sticky` en bas du conteneur (voir app/globals.css),
 * pour rester accessible même sur un formulaire plus long que l'écran.
 */
import { Button } from '@/components/ui/button';

export interface WizardNavProps {
  /** `undefined` à la toute première étape : pas de retour possible. */
  backHref?: string;
  continueLabel?: string;
  continueDisabled?: boolean;
}

export function WizardNav({
  backHref,
  continueLabel = 'Continuer',
  continueDisabled = false,
}: WizardNavProps): JSX.Element {
  return (
    <div className="wizard-nav">
      {backHref ? (
        <Button href={backHref} variant="outline">
          Revenir
        </Button>
      ) : (
        <span />
      )}
      <Button type="submit" disabled={continueDisabled}>
        {continueLabel}
      </Button>
    </div>
  );
}
