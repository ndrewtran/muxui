import { useId } from 'react';
import { Button, Text } from '@muxui/react';

export function MarketingHeroSplitExample() {
  const titleId = useId();
  return (
    <div className="hero-frame">
      {/* One column below 40rem of container width, text first; two columns from 40rem. */}
      <style>{`
        /* A size container takes no width from its content, so give it a width of its own. */
        .hero-frame {
          container-type: inline-size;
          inline-size: 100%;
        }

        .hero {
          display: grid;
          align-items: center;
          gap: var(--muxui-semantic-layout-content-indent);
          padding: var(--muxui-semantic-layout-inset-xlarge) var(--muxui-semantic-layout-viewport-inset);
        }

        .hero-copy {
          display: flex;
          flex-direction: column;
          gap: var(--muxui-semantic-layout-content-gap);
        }

        .hero-actions {
          display: flex;
          flex-wrap: wrap;
          gap: var(--muxui-semantic-layout-action-gap);
        }

        .hero-action {
          flex: 1 1 auto;
        }

        /* The panel is decorative and paints only with tokens and currentColor. */
        .hero-visual {
          inline-size: 100%;
          aspect-ratio: 16 / 10;
          color: var(--muxui-semantic-content-faint);
          background-color: var(--muxui-semantic-surface-subtle);
          border: 1px solid var(--muxui-semantic-border-default);
          border-radius: var(--muxui-semantic-shape-container-radius);
        }

        .hero-visual * {
          fill: none;
          stroke: currentColor;
          stroke-width: 1.5;
          vector-effect: non-scaling-stroke;
        }

        .hero-visual .hero-fill {
          fill: var(--muxui-semantic-surface-hover);
        }

        @container (min-width: 40rem) {
          .hero {
            grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
            padding-inline: var(--muxui-semantic-layout-inset-xlarge);
          }

          .hero-action {
            flex: none;
          }

          .hero-visual {
            aspect-ratio: 4 / 3;
          }
        }
      `}</style>
      <section className="hero" aria-labelledby={titleId}>
        <div className="hero-copy">
          <Text as="h1" id={titleId} variant="display" size="lg">Compose pages from tested parts</Text>
          <Text as="p" size="lg" color="muted">Start from accessible components and plain layout, then adapt the details to your product.</Text>
          <div className="hero-actions">
            <Button className="hero-action" size="lg">Get started</Button>
            <Button className="hero-action" size="lg" variant="neutral">See an example</Button>
          </div>
        </div>
        {/* A Mux-authored product screen: header, sidebar, two tiles, a chart, and two text lines. */}
        <svg className="hero-visual" viewBox="0 0 480 360" preserveAspectRatio="xMinYMin slice" aria-hidden="true" focusable="false">
          <rect x="0" y="0" width="480" height="44" />
          <circle className="hero-fill" cx="28" cy="22" r="10" />
          <rect className="hero-fill" x="60" y="15" width="90" height="14" />
          <rect className="hero-fill" x="400" y="12" width="56" height="20" />
          <path d="M120 44V360" />
          <rect className="hero-fill" x="16" y="64" width="86" height="12" />
          <rect x="16" y="90" width="86" height="12" />
          <rect x="16" y="116" width="86" height="12" />
          <rect x="16" y="142" width="86" height="12" />
          <rect className="hero-fill" x="144" y="68" width="150" height="86" />
          <rect className="hero-fill" x="310" y="68" width="150" height="86" />
          <rect x="144" y="170" width="316" height="120" />
          <path d="M144 250L200 210 250 232 310 176 370 200 460 140" />
          <rect className="hero-fill" x="144" y="306" width="200" height="12" />
          <rect x="144" y="330" width="260" height="12" />
        </svg>
      </section>
    </div>
  );
}
