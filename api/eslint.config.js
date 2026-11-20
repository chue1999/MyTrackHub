import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['error'] }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
      'object-shorthand': 'error',
    },
  },
  {
    // CLI scripts print to the terminal on purpose.
    files: ['src/scripts/**', 'src/config/**'],
    rules: { 'no-console': 'off' },
  },
  prettier,
];
