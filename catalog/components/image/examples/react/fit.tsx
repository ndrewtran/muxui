import { Image } from '@muxui/react';

// A wide diagram with a label at each end and one in the middle. A data URL keeps the example self-contained.
const diagram = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='120'%3E%3Crect width='320' height='120' fill='%23e5e7eb'/%3E%3Ctext x='8' y='68' font-family='sans-serif' font-size='24' fill='%23111827'%3EStart%3C/text%3E%3Ctext x='160' y='68' text-anchor='middle' font-family='sans-serif' font-size='24' fill='%23111827'%3EMiddle%3C/text%3E%3Ctext x='312' y='68' text-anchor='end' font-family='sans-serif' font-size='24' fill='%23111827'%3EEnd%3C/text%3E%3C/svg%3E";

export function ImageFitExample() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
      <figure style={{ margin: 0 }}>
        <Image src={diagram} alt="Diagram from Start through Middle to End" width={160} height={160} fit="cover" style={{ outline: '1px dashed currentColor' }} />
        <figcaption>cover fills the box and crops both ends, so Start and End are lost</figcaption>
      </figure>
      <figure style={{ margin: 0 }}>
        <Image src={diagram} alt="Diagram from Start through Middle to End" width={160} height={160} fit="contain" style={{ outline: '1px dashed currentColor' }} />
        <figcaption>contain keeps the whole diagram</figcaption>
      </figure>
    </div>
  );
}
