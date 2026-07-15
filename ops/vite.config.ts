import { defineConfig } from 'vite';

// On `vite build` (the GitHub Pages deploy) the app is served from the
// /THE-BRAIN/ops/ subpath, so built asset URLs must be prefixed with it.
// During local `vite dev` it stays at the root for convenience.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/THE-BRAIN/ops/' : '/',
}));
