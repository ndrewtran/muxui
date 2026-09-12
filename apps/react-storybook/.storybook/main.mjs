import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { managerThemeCss } from './theme.mjs';

const reactAssets = resolve(import.meta.dirname, '../../../packages/react/assets');
const reactStyles = readFileSync(
  resolve(import.meta.dirname, '../../../packages/react/generated/styles.css'),
  'utf8',
);
const muxuiFontCss = (reactStyles.match(/@font-face\s*\{[^}]+\}/gu) ?? [])
  .map((fontFace) => fontFace.replaceAll("../assets/fonts/", './fonts/'))
  .join('\n');

export default {
  stories: ['generated/**/*.stories.mjs'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  staticDirs: [reactAssets],
  managerHead: (head) => `${head}<style id="muxui-storybook-fonts">${muxuiFontCss}</style><style id="muxui-storybook-theme">${managerThemeCss()}</style>`,
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
