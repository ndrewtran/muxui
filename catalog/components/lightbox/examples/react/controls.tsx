import {
  Lightbox,
  LightboxBackdrop,
  LightboxCaption,
  LightboxClose,
  LightboxContent,
  LightboxNext,
  LightboxPopup,
  LightboxPrevious,
  LightboxTrigger,
} from '@muxui/react';

const photos = [
  { key: 'dawn', label: 'Dawn', color: '#e8a05d', detail: 'First light over the harbour, taken from the east pier.' },
  { key: 'noon', label: 'Noon', color: '#5da7e8', detail: 'The harbour at midday, with the ferry arriving.' },
  { key: 'dusk', label: 'Dusk', color: '#8b5de8', detail: 'The last ferry leaving as the lights come on.' },
];

// A self-contained image, so the example needs no network.
function Photo({ color, label }: { color: string; label: string }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="${color}"/></svg>`;
  return <img src={`data:image/svg+xml,${encodeURIComponent(svg)}`} alt={label} style={{ display: 'block', maxWidth: '100%' }} />;
}

export function LightboxControlsExample() {
  return (
    // Navigation stops at the first and last photo. Set loop to wrap around.
    <Lightbox
      items={photos}
      renderContent={(item, { key }) => {
        const photo = photos.find((candidate) => candidate.key === key);
        return photo ? (
          <figure style={{ margin: 0 }}>
            <Photo color={photo.color} label={item.label ?? photo.label} />
            {/* Essential detail goes in the content. The one-line caption below only names the photo. */}
            <figcaption>{photo.detail}</figcaption>
          </figure>
        ) : null;
      }}
    >
      <LightboxTrigger itemKey="dawn">Open photos</LightboxTrigger>
      <LightboxBackdrop>
        <LightboxPopup>
          <LightboxContent />
          <LightboxCaption />
          <LightboxPrevious />
          <LightboxNext />
          <LightboxClose />
        </LightboxPopup>
      </LightboxBackdrop>
    </Lightbox>
  );
}
