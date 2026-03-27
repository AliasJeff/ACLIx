import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node23',
  outDir: 'dist',
  splitting: false,
  sourcemap: false,
  dts: false,
  clean: true,
  minify: true,
  treeshake: true,
  external: ['better-sqlite3'],
});
