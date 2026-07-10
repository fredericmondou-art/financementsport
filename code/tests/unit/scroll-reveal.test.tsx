// @vitest-environment jsdom
/**
 * Test de ScrollReveal (refonte accueil, BRIEF-REFONTE-ACCUEIL.md §8).
 * IntersectionObserver et matchMedia n'existent pas nativement en jsdom --
 * mockés localement (mêmes conventions que tests/unit/copy-button.test.tsx
 * pour navigator.clipboard).
 */
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScrollReveal } from '@/components/scroll-reveal';

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

describe('ScrollReveal', () => {
  it('affiche toujours son contenu, peu importe le mouvement (dégradation sans JS)', () => {
    mockMatchMedia(false);
    render(
      <ScrollReveal>
        <p>Contenu de section</p>
      </ScrollReveal>,
    );
    expect(screen.getByText('Contenu de section')).toBeVisible();
  });

  it('passe à "reveal--visible" une fois la section intersectée (mouvement autorisé)', () => {
    mockMatchMedia(false);
    vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver);
    const { container } = render(
      <ScrollReveal>
        <p>Section</p>
      </ScrollReveal>,
    );
    expect(container.firstChild).toHaveClass('reveal', 'reveal--visible');
  });

  it('ne cache jamais le contenu si prefers-reduced-motion est actif', () => {
    mockMatchMedia(true);
    vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver);
    const { container } = render(
      <ScrollReveal>
        <p>Section</p>
      </ScrollReveal>,
    );
    // Reste sur la classe de base ("statique") : jamais "reveal--pending".
    expect(container.firstChild).toHaveClass('reveal');
    expect(container.firstChild).not.toHaveClass('reveal--pending');
  });
});
