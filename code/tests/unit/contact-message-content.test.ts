import { describe, expect, it } from 'vitest';
import { buildContactMessageContent } from '@/lib/contact/build-contact-message-content';

describe('buildContactMessageContent', () => {
  it('préfixe le sujet et inclut le nom/courriel/sujet/message en texte brut', () => {
    const content = buildContactMessageContent({
      name: 'Marie Tremblay',
      email: 'marie@example.com',
      subject: 'Question sur ma commande',
      message: 'Bonjour, où en est ma commande #123 ?',
    });

    expect(content.subject).toBe('[Contact site] Question sur ma commande');
    expect(content.text).toContain('Nom : Marie Tremblay');
    expect(content.text).toContain('Courriel : marie@example.com');
    expect(content.text).toContain('Sujet : Question sur ma commande');
    expect(content.text).toContain('Bonjour, où en est ma commande #123 ?');
  });

  it('retire les espaces superflus autour de chaque champ', () => {
    const content = buildContactMessageContent({
      name: '  Marie Tremblay  ',
      email: '  marie@example.com  ',
      subject: '  Question  ',
      message: '  Bonjour  ',
    });

    expect(content.text).toContain('Nom : Marie Tremblay');
    expect(content.text).toContain('Courriel : marie@example.com');
    expect(content.subject).toBe('[Contact site] Question');
  });

  it('échappe le HTML dans le rendu HTML (protection XSS basique)', () => {
    const content = buildContactMessageContent({
      name: '<script>alert(1)</script>',
      email: 'attaquant@example.com',
      subject: 'Test',
      message: 'message',
    });

    expect(content.html).not.toContain('<script>alert(1)</script>');
    expect(content.html).toContain('&lt;script&gt;');
  });

  it('convertit les retours à la ligne du message en <br> dans le HTML', () => {
    const content = buildContactMessageContent({
      name: 'A',
      email: 'a@example.com',
      subject: 'S',
      message: 'ligne 1\nligne 2',
    });

    expect(content.html).toContain('ligne 1<br>ligne 2');
  });
});
