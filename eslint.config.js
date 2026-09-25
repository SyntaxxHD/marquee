// @ts-check

import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import importPlugin from 'eslint-plugin-import-x'
import eslintConfigPrettier from 'eslint-config-prettier'

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'import-x': importPlugin
    },
    rules: {
      'import-x/no-cycle': 'off',
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          pathGroups: [{ pattern: 'bun', group: 'external', position: 'before' }],
          pathGroupsExcludedImportTypes: [],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true }
        }
      ],
      'sort-imports': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' }
      ],
      semi: ['error', 'never'],
      quotes: ['error', 'single', { avoidEscape: true }],
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off'
    }
  },
  eslintConfigPrettier,
  {
    rules: {
      curly: ['error', 'all']
    }
  },
  {
    ignores: [
      'eslint.config.js',
      'prettier.config.js',
      'node_modules/**',
      'dist/**',
      'vendor/**',
      '.hutch/**',
      '.cottontail-tmp/**',
      'build/**',
      'artifacts/**',
      '.claude/**'
    ]
  }
)
