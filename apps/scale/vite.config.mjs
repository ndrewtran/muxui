import { defineConfig, searchForWorkspaceRoot } from 'vite';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createScaleThemeMiddleware } from './src/theme-server.mjs';

const workspaceRoot = searchForWorkspaceRoot(dirname(fileURLToPath(import.meta.url)));

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    fs: { allow: [workspaceRoot] },
  },
  preview: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
  },
  plugins: [{
    name: 'muxui-scale-theme-authoring',
    configureServer(server) {
      server.middlewares.use(createScaleThemeMiddleware({
        workspaceRoot,
        allowedHost: '127.0.0.1:5174',
        allowedOrigin: 'http://127.0.0.1:5174',
      }));
    },
  }],
});
