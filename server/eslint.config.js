import js from '@eslint/js';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
    globalIgnores(['node_modules']),
    {
        files: ['**/*.js'],
        extends: [js.configs.recommended],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: globals.node,
        },
        rules: {
            // Unused arguments are common in Express signatures; an underscore marks them intentional.
            'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
            // Retry and polling loops exit from inside the body.
            'no-constant-condition': ['error', { checkLoops: false }],
            'no-console': 'off',
            eqeqeq: ['error', 'smart'],
            'prefer-const': 'error',
        },
    },
]);
