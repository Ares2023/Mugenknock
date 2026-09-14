// ESLint フラットコンフィグ。
//
// `next lint` は使わない。Next 15 のラッパーが ESLint 9/10 で削除されたオプション
// （useEslintrc / extensions / rulePaths 等）を渡すため起動できず、Next 16 で
// `next lint` 自体が廃止されるため。ESLint CLI を直接使う（npm run lint）。
//
// ESLint のバージョンは 9 系に固定している。10 系では eslint-plugin-react /
// jsx-a11y / import が未対応（peer は eslint<=9）で、実際に
// 「contextOrFilename.getFilename is not a function」等でクラッシュする。
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

export default [
  {
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'node_modules/**',
      'android/**',
      'amplify/**',
      'public/**',
      'lambda/src/node_modules/**',
      'next-env.d.ts',
      // 自動生成物（編集禁止・生成元が別にある）
      'src/aws-exports.js',
      'src/data/originalInstructions.ts',
    ],
  },
  ...nextCoreWebVitals,
  {
    name: 'mugenknock/overrides',
    rules: {
      // ── React Compiler 世代のルール（eslint-plugin-react-hooks v7 で追加） ──
      // eslint-config-next@16（Next 16 向け）が持ち込むが、本プロジェクトは Next 15 で
      // React Compiler を使っていない。既存コードに対して 100 件以上指摘が出るため、
      // 「今すぐ直すべきバグ」と区別できるよう warn に下げる。
      // 新規コードでは従うこと。段階的に潰したら error へ戻す（docs/08-refactor-plan.md）。
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',

      // 静的エクスポート + images.unoptimized のため next/image の最適化が効かない。
      // <img> のままで実害が無いので無効化する。
      '@next/next/no-img-element': 'off',

      // ── ここから下は error のまま維持する（実際の不具合につながるもの） ──
      // react-hooks/rules-of-hooks : フックの条件付き呼び出し。
      //   レンダー間でフック数が変わると React が例外を投げてコンポーネントが落ちる。
      // react-hooks/exhaustive-deps : 既定どおり warn。
      // react/jsx-key               : 既定どおり error。
    },
  },
];
