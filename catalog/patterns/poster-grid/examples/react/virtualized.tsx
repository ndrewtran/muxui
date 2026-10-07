import { useEffect, useState } from 'react';
import { Button, GridList, Image, Link, Text, Virtualizer } from '@muxui/react';

type Poster = { id: string; title: string; year: number; disabled: boolean };

const titles = [
  'Sample Title',
  'Short Title',
  'A Sample Title Long Enough to Wrap Across Several Lines of the Card',
  'Another Title',
  'A Disabled Sample Title That Also Wraps Onto a Second Line',
  'Third Title',
  'Fourth Title',
  'A Medium Sample Title',
  'Fifth Title',
  'Another Sample Title With Plenty of Words in It',
  'Sixth Title',
  'A Last Sample Title',
];

const posters: Poster[] = Array.from({ length: 1000 }, (_, index) => ({
  id: String(index + 1),
  title: titles[index % titles.length],
  year: 1970 + ((index * 7) % 55),
  disabled: index % 11 === 10,
}));

// Placeholder artwork: an empty SVG over a token surface. Use your poster URL as src.
const posterSrc = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>')}`;

// Container breakpoints: 2 columns below 40rem, 4 from 40rem, 6 from 64rem, the same
// thresholds as a CSS @container. The first render, on the server and when hydrating,
// uses 2 columns and never reads the window; the measured width takes over after mount.
function useColumns() {
  const [wrapper, setWrapper] = useState<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState(2);
  useEffect(() => {
    if (!wrapper) return;
    const observer = new ResizeObserver(([entry]) => {
      // Container queries resolve rem against the root font size, so do the same.
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const width = entry.contentRect.width / rem;
      setColumns(width >= 64 ? 6 : width >= 40 ? 4 : 2);
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [wrapper]);
  return { columns, setWrapper };
}

export function PosterGridVirtualizedExample() {
  const { columns, setWrapper } = useColumns();
  return (
    <div ref={setWrapper} className="poster-grid-frame">
      <style>{`
        /* The grid measures this wrapper, so give it a width of its own in a flex row. */
        .poster-grid-frame {
          inline-size: 100%;
        }

        .poster-card {
          gap: var(--muxui-semantic-layout-tight-gap);
        }

        /* The ratio lives on the image alone, so rows measure titles and actions. */
        .poster-art {
          inline-size: 100%;
          background-color: var(--muxui-semantic-surface-track);
        }

        .poster-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--muxui-semantic-layout-action-gap);
          margin-block-start: auto;
          padding-block-start: var(--muxui-semantic-layout-action-gap);
        }
      `}</style>
      {/* With a gap near 28px, minItemWidth 88 fits 2, 4, and 6 columns in 232px, 464px, and 696px. Each fits the narrowest GridList of its tier (about 237px, 621px, and 1005px of inner width after a 17px classic scrollbar), so maxColumns sets the count. */}
      <Virtualizer layout="grid" minItemWidth={88} estimatedItemHeight={470} maxColumns={columns}>
        <GridList aria-label="Posters" layout="grid" selectionMode="multiple" style={{ blockSize: '40rem' }}>
          {posters.map((poster, index) => (
            <GridList.Item key={poster.id} id={poster.id} textValue={poster.title} disabled={poster.disabled} className="poster-card">
              {/* The title names the item, so the artwork is decorative. */}
              <Image className="poster-art" src={posterSrc} alt="" width={200} height={300} radius="md" />
              <Text as="div" variant="title" size="sm">{poster.title}</Text>
              <Text as="div" size="sm" color="muted">#{index + 1} · {poster.year}</Text>
              <div className="poster-actions">
                {/* A Link does not inherit the item's disabled state, so pass it. */}
                <Link href={`#${poster.id}`} disabled={poster.disabled}>Details</Link>
                <Button size="sm" variant="neutral">Save</Button>
              </div>
            </GridList.Item>
          ))}
        </GridList>
      </Virtualizer>
    </div>
  );
}
