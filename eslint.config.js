// CI 用 lint 設定 — 只掃 scripts/(每日管線的保護網)
// 規則刻意只開「會在 runtime 炸掉」的錯誤類型,不管 code style,
// 避免 CI 因風格問題變紅而被忽略。
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      // 核心:未定義變數(2026-06-10 的 currentRank 事故就是這類)
      'no-undef': 'error',
      // 以下關掉純風格/低價值規則,避免噪音
      'no-unused-vars': 'off',
      'no-empty': 'off',
      'no-useless-assignment': 'off',
      'no-constant-condition': ['error', { checkLoops: false }],
    },
  },
  {
    files: ['scripts/**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-undef': 'error',
      'no-unused-vars': 'off',
      'no-empty': 'off',
      'no-useless-assignment': 'off',
      'no-constant-condition': ['error', { checkLoops: false }],
    },
  },
];
