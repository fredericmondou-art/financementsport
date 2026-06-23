/**
 * Indicateur de progression de l'assistant de campagne (Tâche 1.6.B1).
 * Server Component pur — pas d'état, juste l'affichage d'un index d'étape
 * connu côté serveur (`?etape=`, voir `lib/campaigns/draft.ts`). Réutilise la
 * `ProgressBar` du système de design (Tâche 1.4.2) plutôt que d'en redéfinir
 * une — seule la liste textuelle des étapes (`<ol>`) est nouvelle ici.
 *
 * Critère d'acceptation : « la progression est visible sur mobile et
 * desktop » — `<ol>` passe en colonne sur petit écran (voir
 * app/globals.css), jamais masquée.
 */
import { ProgressBar } from '@/components/ui/progress-bar';
import {
  CAMPAIGN_DRAFT_STEP_IDS,
  CAMPAIGN_DRAFT_STEP_LABELS,
  stepIndexFromStepId,
  type CampaignDraftStepId,
} from '@/lib/campaigns/draft';

export interface WizardProgressProps {
  currentStepId: CampaignDraftStepId;
}

export function WizardProgress({ currentStepId }: WizardProgressProps): JSX.Element {
  const total = CAMPAIGN_DRAFT_STEP_IDS.length;
  const currentIndex = stepIndexFromStepId(currentStepId);
  const percent = total > 1 ? ((currentIndex - 1) / (total - 1)) * 100 : 100;

  return (
    <nav aria-label="Progression de l'assistant" className="wizard-progress">
      <p className="wizard-progress__status">
        Étape {currentIndex} sur {total} : <strong>{CAMPAIGN_DRAFT_STEP_LABELS[currentStepId]}</strong>
      </p>
      <ProgressBar percent={percent} label={`Étape ${currentIndex} sur ${total}`} />
      <ol className="wizard-progress__steps">
        {CAMPAIGN_DRAFT_STEP_IDS.map((stepId, index) => {
          const stepNumber = index + 1;
          const isCurrent = stepId === currentStepId;
          const isDone = stepNumber < currentIndex;
          return (
            <li
              key={stepId}
              className={[
                'wizard-progress__step',
                isCurrent ? 'wizard-progress__step--current' : '',
                isDone ? 'wizard-progress__step--done' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {CAMPAIGN_DRAFT_STEP_LABELS[stepId]}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
