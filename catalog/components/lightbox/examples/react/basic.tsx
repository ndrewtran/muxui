import { Lightbox, LightboxBackdrop, LightboxContent, LightboxPopup, LightboxTrigger } from '@muxui/react';
const items = [{ key: 'one', label: 'Example' }];
export function BasicLightbox() { return <Lightbox items={items} renderContent={(item) => <p>{item.label}</p>}><LightboxTrigger itemKey="one">Open image</LightboxTrigger><LightboxBackdrop><LightboxPopup><LightboxContent /></LightboxPopup></LightboxBackdrop></Lightbox>; }
