// import { Dialog } from '@muxui/react' is only a comment: header comments are skipped.
import {
  GridList,
  Virtualizer,
  type GridListProps,
} from '@muxui/react';

const note = 'Posters';

const posters = Array.from({ length: 100 }, (_, index) => ({
  id: String(index + 1),
  label: `Poster ${index + 1}`,
}));

export function PosterGridVirtualized(props: Partial<GridListProps>) {
  return (
    <Virtualizer aria-label="Posters" items={posters}>
      <GridList aria-label={note} items={posters} {...props} />
    </Virtualizer>
  );
}
