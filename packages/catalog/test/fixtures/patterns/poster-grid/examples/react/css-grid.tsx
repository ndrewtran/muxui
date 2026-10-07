import { GridList } from '@muxui/react';

const posters = [
  { id: 'one', label: 'Poster one' },
  { id: 'two', label: 'Poster two' },
];

export function PosterGridCss() {
  return (
    <section>
      <p>Don't see a poster? Add one.</p>
      <GridList aria-label="Posters" items={posters} />
    </section>
  );
}
