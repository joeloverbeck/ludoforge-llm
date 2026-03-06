import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["archive/**", "**/dist/**", "node_modules/**", ".turbo/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["packages/engine/src/cnl/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/kernel/*contract*.js", "**/kernel/*contract*.ts"],
              message: "Import shared contracts from ../contracts/* instead of kernel/*contract* modules.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/engine/src/kernel/effects-*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["./eval-error.js", "./eval-error.ts"],
              message:
                "Import eval constructor helpers through dedicated runtime boundaries instead of directly from eval-error.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-useless-escape": "off",
      "prefer-const": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
);
