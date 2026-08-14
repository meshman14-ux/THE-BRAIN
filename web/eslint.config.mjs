import next from "eslint-config-next";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * ESLint, flat config.
 *
 * Open item 6 said "no ESLint config" since v1.2. `next lint` sat in
 * package.json the whole time and was never usable: deprecated in Next 15, it
 * prompts interactively, and with no config to read it did nothing. So
 * `npx tsc --noEmit` has been the only gate — which catches types and is
 * blind to everything else. On first run this config found a real React
 * anti-pattern (a component defined during render in `/week`) that types
 * could never have seen.
 *
 * `eslint-config-next` ships native flat-config ARRAYS, so no `FlatCompat`
 * shim is needed; the three imports are the layers an old `.eslintrc`
 * "extends" would have listed.
 */
const config = [
  {
    // `_archive` is the retired localStorage prototype (CLAUDE.md, Archived).
    // It is kept as source material, is explicitly not current code, and
    // linting it would report faults nobody intends to fix.
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "coverage/**",
      "next-env.d.ts",
      "**/_archive/**",
    ],
  },
  ...next,
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    /**
     * `react-hooks/set-state-in-effect`, off for four files and ONLY these.
     *
     * All four do the same unavoidable thing: read state that exists only in
     * the browser — `localStorage`, or focus — on mount, and sync it into
     * React. It cannot be done during render, because the server has no
     * localStorage; and it cannot be done in a lazy initialiser, because the
     * server would render the default and the client the saved value, which
     * is a hydration mismatch.
     *
     * ModeSwitch's effect is not incidental: CLAUDE.md records it as the FIX
     * for a real production bug, where `data-mode` went missing after a client
     * navigation and the nav rendered every item from every mode at once.
     * Rewriting it to satisfy this rule would reintroduce that.
     *
     * Listed by file rather than disabled globally, so a SIXTH one has to be
     * added here deliberately instead of arriving unnoticed.
     */
    files: [
      "src/components/ThemeToggle.tsx",
      "src/components/ModeSwitch.tsx",
      "src/components/Capture.tsx",
      "src/components/Meals.tsx",
    ],
    rules: { "react-hooks/set-state-in-effect": "off" },
  },
  {
    rules: {
      /**
       * A leading underscore means "deliberately unused" and the codebase
       * already writes it that way — `const [, _drop] = ...` in food.ts. The
       * default pattern does not know that, so it reported an intent as a
       * fault.
       */
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
];

export default config;
