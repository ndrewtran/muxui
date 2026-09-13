import storybook from 'storybook/package.json' with { type: 'json' };

const runtimeImport = 'storybook/internal/preview/runtime';

// Storybook 10.5.10 has no measure palette API. Adapt only its two canvas
// palettes at build time, and fail on source drift instead of emitting stock
// colours. Getters resolve the active Mux scheme on every canvas draw.
export function projectMeasurePalette(source) {
  let result = source;
  for (const [original, role] of [
    ['#f6b26b', 'measure-margin'], ['#ffe599', 'measure-border'],
    ['#93c47d', 'measure-padding'], ['#6fa8dc', 'measure-content'],
    ['#232020', 'content-strong'],
    ['#f6b26ba8', 'measure-margin'], ['#ffe599a8', 'measure-border'],
    ['#93c47d8c', 'measure-padding'], ['#6fa8dca8', 'measure-content'],
  ]) {
    const pattern = new RegExp(`(margin|border|padding|content|text): "${original}"`, 'gu');
    if ([...result.matchAll(pattern)].length !== 1) {
      throw new Error(`Storybook measure palette changed: expected one ${original} field`);
    }
    result = result.replace(pattern, (_, name) =>
      `get ${name}() { return getComputedStyle(document.documentElement).getPropertyValue('--muxui-semantic-${role}').trim(); }`);
  }
  const translucentLabel = '`${colors[type5]}dd`';
  if (result.split(translucentLabel).length !== 3) {
    throw new Error('Storybook measure label alpha changed: expected two label fills');
  }
  result = result.replaceAll(translucentLabel, 'colors[type5]');
  const effectDependencies = '[measureActive, context.viewMode]';
  if (result.split(effectDependencies).length !== 2) {
    throw new Error('Storybook measure effect changed: expected one dependency list');
  }
  // Repaint an already active canvas when the Mux colour scheme changes.
  return result.replace(effectDependencies, '[measureActive, context.viewMode, context.globals?.colorScheme]');
}

export function measurePaletteViteConfig(config) {
  if (storybook.version !== '10.5.10') throw new Error(`Review the Mux measure palette for Storybook ${storybook.version}`);
  return {
    ...config,
    optimizeDeps: {
      ...config.optimizeDeps,
      // A prebundled dependency bypasses Vite's normal transform hook in dev.
      include: config.optimizeDeps?.include?.filter((id) => id !== runtimeImport),
      exclude: [...(config.optimizeDeps?.exclude ?? []), runtimeImport],
    },
    plugins: [...(config.plugins ?? []), {
      name: 'muxui-storybook-measure-palette',
      enforce: 'pre',
      config: {
        order: 'post',
        handler(resolved) {
          // Storybook's config hook adds its explicit include after viteFinal.
          // Remove it after that hook; explicit includes win over exclusions.
          if (resolved.optimizeDeps?.include) {
            resolved.optimizeDeps.include = resolved.optimizeDeps.include.filter((id) => id !== runtimeImport);
          }
        },
      },
      transform(source, id) {
        if (!id.replaceAll('\\', '/').split('?')[0].endsWith('/storybook/dist/preview/runtime.js')) return null;
        return { code: projectMeasurePalette(source), map: null };
      },
    }],
  };
}
