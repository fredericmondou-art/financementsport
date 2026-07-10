// @vitest-environment jsdom
/**
 * Test de Scoreboard (élément signature, BRIEF-REFONTE-ACCUEIL.md §7).
 * Vérifie surtout la dégradation : le rendu affiche déjà la valeur FINALE
 * par défaut (aucun flash "0" sans JS), et prefers-reduced-motion coupe
 * l'animation entièrement plutôt que de la réduire.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Scoreboard, type ScoreboardItem } from '@/components/scoreboard';

const ITEMS: ScoreboardItem[] = [
  { target: 15, suffix: ' %', label: 'de chaque achat versé au bénéficiaire choisi' },
  { target: 100, suffix: ' %', label: 'du crédit calculé remis intégralement' },
];

function mockMatchMedia(prefersReducedMotion: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockImplementation((query: string) => ({
      matches: prefersReducedMotion,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
    configurable: true,
    writable: true,
  });
}

class ImmediateIntersectionObserver {
  private callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element): void {
    this.callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  disconnect(): void {}
  unobserve(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Scoreboard', () => {
  it('affiche déjà les valeurs finales au rendu (aucun flash à 0 sans JS)', () => {
    mockMatchMedia(false);
    render(<Scoreboard items={ITEMS} />);
    expect(screen.getByText('15 %')).toBeVisible();
    expect(screen.getByText('100 %')).toBeVisible();
    expect(screen.getByText('de chaque achat versé au bénéficiaire choisi')).toBeVisible();
  });

  it('ne relance aucune animation si prefers-reduced-motion est actif (valeurs déjà finales)', () => {
    mockMatchMedia(true);
    vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver);
    render(<Scoreboard items={ITEMS} />);
    expect(screen.getByText('15 %')).toBeVisible();
    expect(screen.getByText('100 %')).toBeVisible();
  });

  it('converge vers les valeurs cibles une fois intersecté (mouvement autorisé)', () => {
    mockMatchMedia(false);
    vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver);
    // rAF simulé pour terminer l'animation en un seul tick (progress >= 1).
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(performance.now() + 10_000);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    render(<Scoreboard items={ITEMS} />);
    expect(screen.getByText('15 %')).toBeVisible();
    expect(screen.getByText('100 %')).toBeVisible();
  });
});
