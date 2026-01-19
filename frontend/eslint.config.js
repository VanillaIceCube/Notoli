const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

module.exports = [
  {
    ignores: ["build/**", "coverage/**", "node_modules/**"],
  },
  ...compat.extends("react-app", "react-app/jest"),
];
