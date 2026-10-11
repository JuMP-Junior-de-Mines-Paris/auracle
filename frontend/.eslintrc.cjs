module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  settings: { react: { version: 'detect' } },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', '.eslintrc.cjs'],
  rules: {
    // Le projet ne documente pas ses props : activer prop-types produirait
    // des centaines d'avertissements sans rien révéler d'utile.
    'react/prop-types': 'off',
    // L'interface est en français : les apostrophes sont partout et parfaitement
    // valides en JSX. La règle vise l'ambiguïté de > et ", pas celle-ci.
    'react/no-unescaped-entities': ['error', { forbid: ['>', '}'] }],
    // Motif « charger au montage » utilisé par tous les hooks de données du
    // projet. Le signaler en erreur reviendrait à condamner l'architecture
    // existante ; en avertissement, il reste visible pour une refonte future.
    'react-hooks/set-state-in-effect': 'warn',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      files: ['src/**/__tests__/**', 'src/**/*.test.{js,jsx}', 'src/setupTests.js'],
      env: { node: true },
      globals: { vi: 'readonly', describe: 'readonly', it: 'readonly', expect: 'readonly', beforeEach: 'readonly', afterEach: 'readonly' },
    },
  ],
}
