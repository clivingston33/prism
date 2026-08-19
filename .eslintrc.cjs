module.exports = {
  root: true,
  extends: [
    "@electron-toolkit/eslint-config-ts",
    "@electron-toolkit/eslint-config-prettier",
  ],
  ignorePatterns: ["node_modules/", "out/", "dist/", "test/fixtures/"],
  rules: {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
  },
};
