const path = require('path');
const { execFileSync } = require('child_process');

test('ESLint 10 flat config handles JSX, browser/Jest globals, hooks, and accessibility', () => {
  const frontendPath = path.resolve(__dirname, '../..');
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
        import { ESLint } from 'eslint';
        const eslint = new ESLint();
        const config = await eslint.calculateConfigForFile('src/config-smoke.jsx');
        const [valid] = await eslint.lintText(
          "import { Fragment } from 'react'; export default function View() { return <Fragment>{window.location.pathname}</Fragment>; } test('smoke', () => expect(true).toBe(true));",
          { filePath: 'src/config-smoke.jsx' },
        );
        const [invalid] = await eslint.lintText(
          "import { useState } from 'react'; export default function View({ active }) { if (active) useState(0); return <img />; }",
          { filePath: 'src/config-smoke.jsx' },
        );
        console.log(JSON.stringify({
          version: ESLint.version,
          plugins: Object.keys(config.plugins),
          valid: valid.messages,
          invalid: invalid.messages.map(message => message.ruleId),
        }));
      `,
    ],
    { cwd: frontendPath, encoding: 'utf8' },
  );
  const result = JSON.parse(output);
  expect(result.version).toMatch(/^10\./);
  expect(result.plugins).not.toContain('prettier');
  expect(result.valid).toEqual([]);
  expect(result.invalid).toContain('react-hooks/rules-of-hooks');
  expect(result.invalid).toContain('jsx-a11y-x/alt-text');
});
