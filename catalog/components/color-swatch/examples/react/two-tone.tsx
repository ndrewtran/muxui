import { ColorSwatch } from '@muxui/react';

export function TwoToneColorSwatchExample() {
  return (
    <ColorSwatch
      color="#4967d8"
      secondaryColor="#e1e5f0"
      shape="circle"
      colorName="Blue and pale grey"
      aria-label="Workspace theme"
    />
  );
}
