// ESLint 8 (eslintrc format). Run with `npm run lint`.
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  settings: { react: { version: '18.2' } },
  plugins: ['react', 'react-hooks', 'react-refresh'],
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'android', 'ios', 'supabase', 'node_modules', 'dev-dist', '*.config.js', '.eslintrc.cjs'],
  rules: {
    'react/prop-types': 'off',
    'react/no-unescaped-entities': 'off',
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    'no-empty': ['error', { allowEmptyCatch: true }],
    // Formatting-only rule, deprecated in ESLint 8.53; style is not enforced by lint here.
    'no-extra-semi': 'off',
    'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      files: ['vite.config.js', 'scripts/**/*.{js,cjs,mjs}'],
      env: { node: true },
    },
  ],
}
