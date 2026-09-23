import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      'apps/api/drizzle/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // CLAUDE.md non-negotiable: no `any`
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: [
      'apps/api/**/*.ts',
      'packages/types/**/*.ts',
      'apps/miniapp/vite.config.ts',
      // Operator scripts, run with `node` — Buffer, process and console are
      // theirs by right. Listed rather than exempted: the ignore block above
      // says plain-JS scripts should be linted, not silently skipped.
      'apps/miniapp/scripts/**/*.mjs',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/miniapp/**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: { globals: globals.browser },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs['recommended-latest'].rules,
      'react/prop-types': 'off', // TypeScript covers prop validation
    },
  },
)
