import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { managerThemeCss, previewThemeCss } from './theme.mjs';

const reactAssets = resolve(import.meta.dirname, '../../../packages/react/assets');
const reactStyles = readFileSync(
  resolve(import.meta.dirname, '../../../packages/react/generated/styles.css'),
  'utf8',
);
const muxuiFontCss = (reactStyles.match(/@font-face\s*\{[^}]+\}/gu) ?? [])
  .map((fontFace) => fontFace.replaceAll("../assets/fonts/", './fonts/'))
  .join('\n');
const muxuiPreviewColorSchemeBootstrap = `<script>
  (() => {
    const globals = new URLSearchParams(window.location.search).get('globals') ?? '';
    document.documentElement.setAttribute(
      'data-muxui-color-scheme',
      /(?:^|;)colorScheme:dark(?:;|$)/u.test(globals) ? 'dark' : 'light',
    );
  })();
</script>`;

export default {
  stories: ['generated/**/*.stories.mjs'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  staticDirs: [reactAssets],
  managerHead: (head) => `${head}<style id="muxui-storybook-fonts">${muxuiFontCss}</style><style id="muxui-storybook-theme">${managerThemeCss()}</style>`,
  previewHead: (head) => `${head}${muxuiPreviewColorSchemeBootstrap}<style id="muxui-storybook-preview-theme">${previewThemeCss()}</style>`,
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  typescript: {
    reactDocgen: false,
  },
  docs: {
    autodocs: 'tag',
  },
};
