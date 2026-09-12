import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
  managerHead: (head) => `${head}<style id="muxui-storybook-fonts">${muxuiFontCss}</style>`,
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
