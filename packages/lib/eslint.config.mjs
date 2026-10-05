export default [
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    ignores: ["node_modules/**", "dist/**", ".turbo/**"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {},
  },
];
