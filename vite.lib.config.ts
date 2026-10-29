import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

const external = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys((pkg as { peerDependencies?: Record<string, string> }).peerDependencies ?? {}),
];

/** Library build: `npm run build:lib` → dist-lib/ (ESM + .d.ts). Dependencies stay external. */
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    outDir: 'dist-lib',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: fileURLToPath(new URL('./src/components/calendar/index.ts', import.meta.url)),
      formats: ['es'],
      fileName: 'index',
    },
    rolldownOptions: {
      external: (id) => external.some((dep) => id === dep || id.startsWith(`${dep}/`)) || id === 'react/jsx-runtime',
    },
  },
});
