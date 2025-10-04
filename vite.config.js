import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { coverageConfigDefaults } from 'vitest/config';

import ViteWabt from 'vite-plugin-wabt';
import wabt from 'wabt';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      fileName: 'index',
      name: 'ecstc',
    },
    rollupOptions: {
      external: ['crunches'],
      output: {globals: {crunches: 'crunches'}},
    },
    sourcemap: true,
    target: 'esnext',
  },
  plugins: [
    new ViteWabt(await wabt())
  ],
  test: {
    coverage: {
      exclude: [
        '{bench,dev,examples}/**',
        ...coverageConfigDefaults.exclude,
      ],
    },
    poolOptions: {
      forks: {
        execArgv: ['--expose-gc'],
      },
    },
    projects: [
      {
        extends: './vite.config.js',
        test: {
          include: [
            'src/**/*.test.js',
          ],
          name: 'test',
        },
      },
    ],
  },
});
