import next from 'eslint-config-next';

/*
 * eslint-config-next 16 ships a native flat-config array, so it is spread
 * directly. The FlatCompat shim is neither needed nor compatible here.
 */
const config = [
  ...next,

  {
    ignores: ['.next/**', 'node_modules/**', 'e2e/**', 'public/**'],
  },

  {
    files: [
      'app/**/*.{js,jsx}',
      'components/**/*.{js,jsx}',
      'features/**/*.{js,jsx}',
      'hooks/**/*.{js,jsx}',
    ],
    rules: {
      /*
       * RTL readiness — the single highest-leverage preparation for Phase 07.
       *
       * Physical direction utilities (ml-, mr-, pl-, pr-, text-left,
       * text-right, border-l, border-r) do not flip under dir="rtl". Their
       * logical equivalents (ms-, me-, ps-, pe-, text-start, text-end,
       * border-s, border-e) do.
       *
       * Enforced from the first component rather than fixed later, because
       * retrofitting this across a finished UI is a rewrite, not a refactor
       * (docs/product/UI_UX_DIRECTION.md §10).
       */
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "JSXAttribute[name.name='className'] Literal[value=/(^|\\s)-?(ml|mr|pl|pr|border-l|border-r|rounded-l|rounded-r)-|(^|\\s)text-(left|right)(\\s|$)/]",
          message:
            'Use logical CSS properties so the layout survives dir="rtl": ms-/me-, ps-/pe-, border-s/border-e, text-start/text-end. See docs/product/UI_UX_DIRECTION.md §10.',
        },
        {
          selector:
            "JSXAttribute[name.name='className'] TemplateElement[value.raw=/(^|\\s)-?(ml|mr|pl|pr|border-l|border-r|rounded-l|rounded-r)-|(^|\\s)text-(left|right)(\\s|$)/]",
          message:
            'Use logical CSS properties so the layout survives dir="rtl": ms-/me-, ps-/pe-, border-s/border-e, text-start/text-end. See docs/product/UI_UX_DIRECTION.md §10.',
        },
      ],
    },
  },
];

export default config;
