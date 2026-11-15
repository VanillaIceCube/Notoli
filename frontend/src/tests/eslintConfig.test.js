// @vitest-environment node

test('ESLint flat config validates JSX, test globals, hooks and accessibility', async () => {
  const { ESLint } = await import('eslint');
  const eslint = new ESLint({
    cwd: new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  });
  const config = await eslint.calculateConfigForFile('src/config-smoke.jsx');
  const [valid] = await eslint.lintText(
    "import { Fragment } from 'react'; export default function View() { return <Fragment>{window.location.pathname}</Fragment>; } test('smoke', () => expect(true).toBe(true));",
    { filePath: 'src/config-smoke.jsx' },
  );
  const [invalid] = await eslint.lintText(
    "import { useState } from 'react'; export default function View({ active }) { if (active) useState(0); return <img />; }",
    { filePath: 'src/config-smoke.jsx' },
  );

  expect(ESLint.version).toMatch(/^10\./);
  expect(Object.keys(config.plugins)).not.toContain('prettier');
  expect(valid.messages).toEqual([]);
  expect(invalid.messages.map((message) => message.ruleId)).toContain('react-hooks/rules-of-hooks');
  expect(invalid.messages.map((message) => message.ruleId)).toContain('jsx-a11y-x/alt-text');
});
