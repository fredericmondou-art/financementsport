/**
 * Aperçu provisoire de la nouvelle direction visuelle (TÂCHE V1 de
 * `docs/prompts/07-prompts-refonte-visuelle.md`). Montre la palette, deux
 * paires typographiques candidates et quelques composants types tels que
 * proposés par `docs/DESIGN.md`, pour validation par le propriétaire AVANT
 * toute application au reste du site.
 *
 * Important :
 * - Page isolée et non indexée, jamais liée depuis la navigation du site.
 * - N'utilise PAS `components/ui/*` (qui reflètent encore l'ancienne
 *   direction validée 2026-06-22) : tout le style ci-dessous vient d'un
 *   module CSS scopé à cette page (`styleguide-refonte.module.css`), donc
 *   strictement sans impact sur le reste du site.
 * - Les couleurs/polices ci-dessous reprennent `docs/DESIGN.md` tel que
 *   proposé, SAUF mention contraire signalée dans la section « Constats ».
 */
import type { Metadata } from 'next';
import { Bricolage_Grotesque, Fraunces, Inter, Plus_Jakarta_Sans } from 'next/font/google';
import styles from './styleguide-refonte.module.css';

export const metadata: Metadata = {
  title: 'Aperçu — refonte visuelle (interne)',
  robots: { index: false, follow: false },
};

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--apercu-font-bricolage',
  display: 'swap',
});
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--apercu-font-fraunces',
  display: 'swap',
});
const interFont = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--apercu-font-inter',
  display: 'swap',
});
const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--apercu-font-jakarta',
  display: 'swap',
});

type Swatch = { name: string; hex: string; textOn?: 'ink' | 'white'; ratio?: string; verdict?: 'ok' | 'echec' };

const palettePrincipale: Swatch[] = [
  { name: 'primary-50', hex: '#FFF4ED' },
  { name: 'primary-100', hex: '#FFE0CC' },
  { name: 'primary-500', hex: '#F4732B', textOn: 'white', ratio: '2.86:1', verdict: 'echec' },
  { name: 'primary-600', hex: '#DC5A14', textOn: 'white', ratio: '3.81:1', verdict: 'echec' },
  { name: 'primary-700', hex: '#B4430A', textOn: 'white', ratio: '5.60:1', verdict: 'ok' },
];
const paletteSecondaire: Swatch[] = [
  { name: 'secondary-50', hex: '#E8F6F1' },
  { name: 'secondary-500', hex: '#1F9E7A', textOn: 'white', ratio: '3.37:1', verdict: 'echec' },
  { name: 'secondary-700', hex: '#0F6E56', textOn: 'white', ratio: '6.20:1', verdict: 'ok' },
];
const neutres: Swatch[] = [
  { name: 'ink', hex: '#2A2622' },
  { name: 'slate', hex: '#6B635C' },
  { name: 'cream', hex: '#FBF7F2' },
  { name: 'surface', hex: '#FFFFFF' },
  { name: 'border', hex: '#ECE5DC' },
];
const etats: Swatch[] = [
  { name: 'success', hex: '#1F9E7A', textOn: 'white', ratio: '3.37:1', verdict: 'echec' },
  { name: 'warning', hex: '#E89B22', textOn: 'white', ratio: '2.30:1', verdict: 'echec' },
  { name: 'danger', hex: '#D8483F', textOn: 'white', ratio: '4.27:1', verdict: 'echec' },
  { name: 'info', hex: '#2C7BB8', textOn: 'white', ratio: '4.53:1', verdict: 'ok' },
];

function SwatchRow({ items }: { items: Swatch[] }): JSX.Element {
  return (
    <div className={styles.swatchRow}>
      {items.map((s) => (
        <div key={s.name} className={styles.swatch}>
          <div className={styles.swatchColor} style={{ background: s.hex }}>
            {s.textOn && (
              <span className={s.textOn === 'white' ? styles.swatchTextWhite : styles.swatchTextInk}>Aa</span>
            )}
          </div>
          <div className={styles.swatchLabel}>
            <strong>{s.name}</strong>
            <code>{s.hex}</code>
            {s.ratio && (
              <span className={s.verdict === 'ok' ? styles.badgeOk : styles.badgeEchec}>
                {s.ratio} {s.verdict === 'ok' ? '— AA' : '— échec AA (texte normal)'}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function StyleguideRefontePage(): JSX.Element {
  return (
    <main
      className={`${styles.page} ${bricolage.variable} ${fraunces.variable} ${interFont.variable} ${plusJakarta.variable}`}
    >
      <header className={styles.intro}>
        <p className={styles.kicker}>Aperçu interne — non public — Tâche V1</p>
        <h1>Direction visuelle proposée (refonte)</h1>
        <p>
          Page de validation uniquement. Aucun changement n&apos;a encore été appliqué au reste du site.
          Voir <code>docs/DESIGN.md</code> et <code>docs/prompts/07-prompts-refonte-visuelle.md</code>.
        </p>
      </header>

      <section className={styles.section}>
        <h2>1. Constats — contrastes WCAG AA</h2>
        <p>
          Calcul par formule de luminance relative officielle (pas une estimation visuelle), sur chaque
          paire texte blanc / fond proposée par <code>docs/DESIGN.md</code>. Plusieurs combinaisons
          <strong> échouent l&apos;AA pour du texte normal</strong> (seuil 4.5:1) — voir badges rouges
          ci-dessous.
        </p>
        <div className={styles.alertEchec}>
          <strong>5 combinaisons à corriger avant application :</strong> texte blanc sur
          primary-500 (2.86:1), primary-600 (3.81:1), secondary-500/success (3.37:1), warning (2.30:1) et
          danger (4.27:1) ne respectent pas l&apos;AA pour du texte normal. Recommandation : utiliser{' '}
          <code>primary-700</code> (5.60:1) comme fond de bouton principal plutôt que{' '}
          <code>primary-600</code>, et traiter <code>warning</code> comme l&apos;ambre de l&apos;ancienne
          direction (fond clair teinté + texte foncé, jamais texte blanc dessus). <code>secondary-700</code>{' '}
          et <code>info</code> passent déjà l&apos;AA tels que proposés.
        </div>
      </section>

      <section className={styles.section}>
        <h2>2. Palette</h2>
        <h3>Principale (orange/corail)</h3>
        <SwatchRow items={palettePrincipale} />
        <h3>Secondaire (teal)</h3>
        <SwatchRow items={paletteSecondaire} />
        <h3>Neutres chauds</h3>
        <SwatchRow items={neutres} />
        <h3>États</h3>
        <SwatchRow items={etats} />
      </section>

      <section className={styles.section}>
        <h2>3. Typographie — deux options réelles (chargées)</h2>
        <p className={styles.note}>
          Note : « Clash Display » (3<sup>e</sup> option du DESIGN.md) n&apos;est pas distribuée via Google
          Fonts et demanderait un auto-hébergement séparé (Fontshare) — non chargée ici par souci de
          simplicité. Les deux options ci-dessous sont chargées via <code>next/font/google</code>, comme
          tout le reste du site.
        </p>

        <div className={styles.fontOption} style={{ fontFamily: 'var(--apercu-font-bricolage)' }}>
          <p className={styles.fontOptionLabel}>Option A — Titres : Bricolage Grotesque / Corps : Inter</p>
          <p className={styles.heroSample}>Choisis qui tu veux encourager</p>
          <p className={styles.h2Sample}>Comment ça fonctionne</p>
          <p style={{ fontFamily: 'var(--apercu-font-inter)' }} className={styles.bodySample}>
            Chaque achat dans la boutique génère un crédit versé directement à l&apos;athlète, l&apos;équipe
            ou le club que tu choisis. 1 240 $ amassés sur 2 000 $.
          </p>
        </div>

        <div className={styles.fontOption} style={{ fontFamily: 'var(--apercu-font-fraunces)' }}>
          <p className={styles.fontOptionLabel}>Option B — Titres : Fraunces / Corps : Plus Jakarta Sans</p>
          <p className={styles.heroSample}>Choisis qui tu veux encourager</p>
          <p className={styles.h2Sample}>Comment ça fonctionne</p>
          <p style={{ fontFamily: 'var(--apercu-font-jakarta)' }} className={styles.bodySample}>
            Chaque achat dans la boutique génère un crédit versé directement à l&apos;athlète, l&apos;équipe
            ou le club que tu choisis. 1 240 $ amassés sur 2 000 $.
          </p>
        </div>
      </section>

      <section className={styles.section}>
        <h2>4. Composants types (palette corrigée)</h2>
        <div className={styles.componentsRow}>
          <button type="button" className={styles.btnPrimary}>
            Encourager
          </button>
          <button type="button" className={styles.btnOutline}>
            Voir la boutique
          </button>
          <span className={styles.badgeSuccess}>Payé</span>
          <span className={styles.badgeWarning}>En attente</span>
        </div>
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Pack Saison</h3>
          <p>Génère 18,00 $ de crédit de financement par unité.</p>
        </div>
      </section>

      <section className={styles.section}>
        <h2>5. Maquette de section héros (exemple, Option A)</h2>
        <div className={styles.heroMock} style={{ fontFamily: 'var(--apercu-font-inter)' }}>
          <p className={styles.heroMockTitle} style={{ fontFamily: 'var(--apercu-font-bricolage)' }}>
            Encourage un jeune athlète, simplement
          </p>
          <p className={styles.heroMockBody}>
            Achète dans la boutique, choisis qui tu veux encourager : ton paiement devient un crédit
            réel pour son équipe ou son club.
          </p>
          <div className={styles.heroMockActions}>
            <button type="button" className={styles.btnPrimary}>
              Trouver un athlète
            </button>
            <button type="button" className={styles.btnOutline}>
              Voir la boutique
            </button>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>6. Décisions encore ouvertes</h2>
        <ul>
          <li>
            <strong>Registre tu/vous.</strong> L&apos;ancienne direction (archivée) avait fixé le
            vouvoiement par défaut. Cette nouvelle proposition utilise le tutoiement dans ses exemples
            (« Choisis qui tu veux encourager »). À confirmer explicitement.
          </li>
          <li>
            <strong>Police des titres.</strong> Bricolage Grotesque (Option A) ou Fraunces (Option B)
            ci-dessus — ou Clash Display en auto-hébergement séparé si préféré.
          </li>
        </ul>
      </section>
    </main>
  );
}
