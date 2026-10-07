import { Button, GridList, Image, Link, Text } from '@muxui/react';

type Poster = { id: string; title: string; year: number; disabled?: boolean };

const posters: Poster[] = [
  { id: 'poster-1', title: 'Sample Title', year: 2013 },
  { id: 'poster-2', title: 'Short Title', year: 2021 },
  { id: 'poster-3', title: 'A Sample Title Long Enough to Wrap Across Several Lines of the Card', year: 2018 },
  { id: 'poster-4', title: 'Another Title', year: 1973 },
  { id: 'poster-5', title: 'A Disabled Sample Title That Also Wraps Onto a Second Line', year: 2009, disabled: true },
  { id: 'poster-6', title: 'Third Title', year: 2016 },
  { id: 'poster-7', title: 'Fourth Title', year: 1998 },
  { id: 'poster-8', title: 'A Medium Sample Title', year: 2024 },
  { id: 'poster-9', title: 'Fifth Title', year: 2005 },
  { id: 'poster-10', title: 'Another Disabled Sample Title With Plenty of Words in It', year: 2019, disabled: true },
  { id: 'poster-11', title: 'Sixth Title', year: 1987 },
  { id: 'poster-12', title: 'A Last Sample Title', year: 2011 },
];

// Placeholder artwork: an empty SVG over a token surface. Use your poster URL as src.
const posterSrc = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>')}`;

export function PosterGridCssGridExample() {
  return (
    <div className="poster-grid-frame">
      {/* Columns follow the container's width: 2 below 40rem, 4 from 40rem, 6 from 64rem. */}
      <style>{`
        /* A size container takes no width from its content, so give it a width of its own. */
        .poster-grid-frame {
          container-type: inline-size;
          inline-size: 100%;
        }

        .poster-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        @container (min-width: 40rem) {
          .poster-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
        }

        @container (min-width: 64rem) {
          .poster-grid {
            grid-template-columns: repeat(6, minmax(0, 1fr));
          }
        }

        .poster-card {
          gap: var(--muxui-semantic-layout-tight-gap);
        }

        /* The ratio lives on the image alone, so titles and actions size to their content. */
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
      <GridList aria-label="Posters" layout="grid" selectionMode="multiple" className="poster-grid">
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
    </div>
  );
}
