import tseslint from 'typescript-eslint';
export default [
  { ignores: ['dist/**', 'node_modules/**', '.npm-cache/**'] },
  { files: ['**/*.mjs', '**/*.ts', '**/*.tsx'], languageOptions: { parser: tseslint.parser,
    ecmaVersion: 2022, sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: { 'no-debugger': 'error', 'no-constant-condition': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error' } }
];
