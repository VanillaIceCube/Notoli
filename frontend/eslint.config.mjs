import js from '@eslint/js';
import eslintReact from '@eslint-react/eslint-plugin';
import jsxA11y from 'eslint-plugin-jsx-a11y-x';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import testingLibrary from 'eslint-plugin-testing-library';

export default [
  { ignores: ['build/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  eslintReact.configs.recommended,
  reactHooks.configs.flat.recommended,
  jsxA11y.configs.recommended,
  { ...testingLibrary.configs['flat/react'], files: ['src/**/*.test.{js,jsx}'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.jest },
    },
    rules: {
      // Preserve the existing lint policy while migrating the supported plugin family.
      '@eslint-react/no-array-index-key': 'off',
      '@eslint-react/purity': 'off',
      '@eslint-react/set-state-in-effect': 'off',
      '@eslint-react/use-state': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'jsx-a11y-x/no-autofocus': 'off',
      'preserve-caught-error': 'off',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
    },
  },
];
