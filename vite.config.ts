import { resolve } from 'node:path'

/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { coverageConfigDefaults } from 'vitest/config'
// @ts-expect-error - no types
import ViteWabt from 'vite-plugin-wabt'
import wabt from 'wabt'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      fileName: 'index',
      formats: ['es'],
    },
    rolldownOptions: {
      external: ['crunches'],
    },
    sourcemap: true,
    target: 'es2023',
  },
  plugins: [
    ViteWabt(await wabt())
  ],
  test: {
    coverage: {
      exclude: [
        '{benchmark,dev,examples}/**',
        ...coverageConfigDefaults.exclude,
      ],
    },
    execArgv: ['--expose-gc'],
    projects: [
      {
        extends: './vite.config.ts',
        test: {
          include: [
            'src/**/*.test.ts',
          ],
          name: 'test',
        },
      },
      {
        extends: './vite.config.ts',
        test: {
          include: [
            'benchmark/**/*.ts',
          ],
          name: 'bench',
        },
      },
    ],
  },
})
