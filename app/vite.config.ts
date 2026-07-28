import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the same build works at any path — GitHub Pages
// (username.github.io/THE-BRAIN/) or a custom domain.
export default defineConfig({
  plugins: [react()],
  base: './',
  test: {
    environment: 'jsdom',
  },
});
