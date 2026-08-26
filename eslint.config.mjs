import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.expo/**',
      'apps/mobile/expo-env.d.ts',
      'apps/api/drizzle/**',
      // Targeted, not '**/*.js': future plain-JS files (scripts) should be
      // linted, not silently exempt. metro.config.js and babel.config.js are
      // Node.js CommonJS files that use require/module/__dirname legitimately.
      'apps/mobile/babel.config.js',
      'apps/mobile/metro.config.js',
      // Added when app.json was replaced by app.config.js (fa567a7). Same
      // category as the two above — CommonJS `module.exports` — but it was
      // never added here, so `npm run lint` has failed on every branch and on
      // main ever since, making CI red by default and its signal worthless.
      'apps/mobile/app.config.js',
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
    files: ['apps/api/**/*.ts', 'packages/types/**/*.ts', 'apps/miniapp/vite.config.ts'],
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
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser, __DEV__: 'readonly' } },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs['recommended-latest'].rules,
      'react/prop-types': 'off', // TypeScript covers prop validation
    },
  },
)
