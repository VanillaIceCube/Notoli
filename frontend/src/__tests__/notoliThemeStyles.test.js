import fs from 'fs';
import path from 'path';

describe('Notoli theme styles', () => {
  const appCss = fs.readFileSync(path.join(__dirname, '../App.css'), 'utf8');

  test('keeps MUI text field focus states on the Notoli color instead of default blue', () => {
    expect(appCss).toContain('.MuiInputLabel-root.Mui-focused');
    expect(appCss).toContain('.MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline');
    expect(appCss).toContain('color: var(--secondary-color) !important');
    expect(appCss).toContain('border-color: var(--secondary-color) !important');
    expect(appCss).toContain('border-bottom-color: var(--secondary-color) !important');
  });
});
