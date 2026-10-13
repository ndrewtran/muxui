// Compiles the public styling surface `@muxui/react` ships for one component's
// `web.react` binding. It adapts the surface compiler of the parked `@muxui/web`
// package (Decision 0031 item 13) and states only what React ships today.
//
// Each of these is left out until the stage that adds it, and that stage extends
// this compiler and its test:
// - `data-muxui-state-*` state attributes: Stage 2;
// - `data-muxui-slot` slots and `muxui:` DOM events: they belong to the `web.html`
//   contract and return with W1.0, so React never publishes them (item 14).

const BINDING_ID = 'web.react';
// The one stylesheet entry React ships today; Stage 3 splits it.
const STYLE_EXPORT = './styles.css';

// Decision 0031 item 15: the layers every shipped style entry declares first, in rank order.
const CASCADE_LAYERS = Object.freeze(['muxui.tokens', 'muxui.components', 'muxui.utilities']);

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function slugFromArtifactRef(artifactRef) {
  const match = /^muxui:component:([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(artifactRef);
  if (!match) throw new Error(`MUXUI_REACT_SURFACE_ARTIFACT_INVALID: ${artifactRef}`);
  return match[1];
}

export function hookName(tokenId) {
  return `--muxui-${tokenId.replaceAll('.', '-')}`;
}

/**
 * `artifact` is the authored component record, `packageExports` the keys of the
 * `@muxui/react` manifest `exports`, and `tokenSource` the authored token record.
 */
export function compileReactSurface({ artifact, packageExports, tokenSource }) {
  const binding = artifact?.bindings?.[BINDING_ID];
  if (!binding) {
    throw new Error(`MUXUI_REACT_SURFACE_BINDING_MISSING: ${artifact?.id ?? 'unknown'}#${BINDING_ID}`);
  }
  const slug = slugFromArtifactRef(artifact.id);
  if (!packageExports.includes(STYLE_EXPORT)) {
    throw new Error(`MUXUI_REACT_SURFACE_EXPORT_MISSING: ${STYLE_EXPORT}`);
  }
  const publicCustomProperties = binding.tokenRecipe.requirements
    .filter(({ token }) => tokenSource.tokens[token]?.overridePolicy === 'instance')
    .map(({ token }) => hookName(token))
    .sort(compareText);
  return Object.freeze({
    artifactRef: artifact.id,
    bindingRef: `${artifact.id}#${BINDING_ID}`,
    lifecycle: binding.lifecycle,
    rootClass: `.muxui-${slug}`,
    cascadeLayers: CASCADE_LAYERS,
    publicCustomProperties: Object.freeze(publicCustomProperties),
    styleExport: `@muxui/react${STYLE_EXPORT.slice(1)}`,
  });
}
