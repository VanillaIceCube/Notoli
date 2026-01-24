const path = require("path");

test("eslint config does not extend prettier", () => {
  const configPath = path.resolve(__dirname, "../../.eslintrc.js");
  const eslintConfig = require(configPath);
  expect(eslintConfig.extends).not.toContain("prettier");
});
