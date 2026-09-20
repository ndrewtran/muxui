import * as React from 'react';
import { ColorSwatch } from '@muxui/react';

const swatch = <ColorSwatch color="#ff0000" secondaryColor="#0000ff80" shape="circle" colorName="Theme colours" aria-label="Workspace" style={{ width: 24 }} ref={React.createRef<HTMLDivElement>()} />;
// @ts-expect-error Mux owns the shape vocabulary.
const invalidShape = <ColorSwatch color="#ff0000" shape="triangle" />;
// @ts-expect-error Upstream colour objects do not cross the Mux API boundary.
const upstreamColor = <ColorSwatch color="#ff0000" secondaryColor={{ red: 255 }} />;
void [swatch, invalidShape, upstreamColor];
