import { Lightbox, LightboxBackdrop, LightboxContent, LightboxPopup, LightboxTrigger } from '@muxui/react';

const photos = [
  { key: 'dawn', label: 'Dawn', color: '#e8a05d' },
  { key: 'noon', label: 'Noon', color: '#5da7e8' },
  { key: 'dusk', label: 'Dusk', color: '#8b5de8' },
];

// A self-contained image, so the example needs no network.
function Photo({ itemKey, label }: { itemKey: string | number; label?: string }) {
  const color = photos.find((photo) => photo.key === itemKey)?.color ?? '#999999';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="${color}"/></svg>`;
  return <img src={`data:image/svg+xml,${encodeURIComponent(svg)}`} alt={label} style={{ display: 'block', maxWidth: '100%' }} />;
}

export function LightboxRenderFunctionsExample() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--muxui-reference-dimension-space-xs)' }}>
      {/* The Lightbox render function receives the item, then a context with key, index, and count. */}
      <Lightbox
        items={photos}
        renderContent={(item, { key, index, count }) => (
          <figure style={{ margin: 0 }}>
            <Photo itemKey={key} label={item.label} />
            <figcaption>{item.label}, {index + 1} of {count}</figcaption>
          </figure>
        )}
      >
        <LightboxTrigger itemKey="dawn">Open with the Lightbox render function</LightboxTrigger>
        <LightboxBackdrop>
          <LightboxPopup>
            <LightboxContent />
          </LightboxPopup>
        </LightboxBackdrop>
      </Lightbox>
      {/* The LightboxContent render function receives one object and takes precedence. */}
      <Lightbox items={photos}>
        <LightboxTrigger itemKey="dawn">Open with the LightboxContent render function</LightboxTrigger>
        <LightboxBackdrop>
          <LightboxPopup>
            <LightboxContent
              renderContent={({ item, key, index, count }) => (
                <figure style={{ margin: 0 }}>
                  <Photo itemKey={key} label={item.label} />
                  <figcaption>Item {index + 1} of {count}: {key}</figcaption>
                </figure>
              )}
            />
          </LightboxPopup>
        </LightboxBackdrop>
      </Lightbox>
    </div>
  );
}
