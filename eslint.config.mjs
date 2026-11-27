import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', '.worktrees/', 'coverage/', '.installer-test-*/'] },
  js.configs.recommended,
  {
    files: ['**/*.mjs', '**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
    rules: { 'no-unused-vars': ['error', { ignoreRestSiblings: true }] }
  },
  {
    files: ['dashboard/**/*.js'],
    languageOptions: { globals: globals.browser }
  }
];
