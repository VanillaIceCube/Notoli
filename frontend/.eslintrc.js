module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    jest: true,
    es2020: true,
  },
  ignorePatterns: ["build/**", "coverage/**", "node_modules/**"],
  settings: {
    react: {
      version: "detect",
    },
  },
  extends: ["react-app", "react-app/jest"],
  rules: {
    "react/react-in-jsx-scope": "off",
    "react/prop-types": "off",
    "jsx-a11y/no-autofocus": "off",
  },
};
