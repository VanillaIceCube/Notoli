// @vitest-environment node

import fs from 'fs';
import path from 'path';

describe('Notoli theme styles', () => {
  const globalCss = fs.readFileSync(path.join(__dirname, '../index.css'), 'utf8');

  test('keeps MUI text field focus states on the Notoli color instead of default blue', () => {
    expect(globalCss).toContain('.MuiInputLabel-root.Mui-focused');
    expect(globalCss).toContain(
      '.MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline',
    );
    expect(globalCss).toContain('color: var(--secondary-color) !important');
    expect(globalCss).toContain('border-color: var(--secondary-color) !important');
    expect(globalCss).toContain('border-bottom-color: var(--secondary-color) !important');
  });
});
