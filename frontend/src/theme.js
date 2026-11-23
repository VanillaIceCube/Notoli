import { createTheme } from '@mui/material/styles';

// The theme owns these colors; CssBaseline exposes the existing variables for
// component-specific styles and the remaining document CSS.
const white = '#ffffff';
const themeTokens = {
  pageBackground: '#1a1a1a',
  surfaceBackground: '#f5e79e',
  surfaceText: '#555555',
  pageText: white,
};
const documentFont =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif';

const overlayPaper = ({ theme }) => ({
  color: themeTokens.surfaceText,
  border: `2.5px solid ${themeTokens.pageBackground}`,
  borderRadius: 6,
  boxShadow: theme.shadows[3],
});

const appTheme = createTheme({
  // Controls sit on pale surfaces. A dark document does not require dark inputs.
  palette: {
    mode: 'light',
    primary: { main: themeTokens.surfaceText, contrastText: white },
    background: { default: themeTokens.pageBackground, paper: themeTokens.surfaceBackground },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ':root': {
          '--page-background': themeTokens.pageBackground,
          '--surface-background': themeTokens.surfaceBackground,
          '--surface-text': themeTokens.surfaceText,
          '--page-text': themeTokens.pageText,
        },
        // Preserve the existing page dimensions and system document typography;
        // individual MUI controls retain their standard Roboto typography.
        html: { boxSizing: 'content-box' },
        body: {
          fontFamily: documentFont,
          lineHeight: 'normal',
          letterSpacing: 'normal',
          color: themeTokens.pageText,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: themeTokens.pageBackground,
          color: themeTokens.surfaceBackground,
          boxShadow: 'none',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: { paper: { color: themeTokens.surfaceText } },
    },
    MuiPopover: {
      styleOverrides: { paper: overlayPaper },
    },
    MuiMenu: {
      styleOverrides: { paper: overlayPaper },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          variants: [{ props: { variant: 'outlined' }, style: { backgroundColor: white } }],
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: { root: { '&.Mui-focused': { color: themeTokens.surfaceText } } },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: themeTokens.surfaceText,
          },
        },
      },
    },
    MuiInput: {
      styleOverrides: { underline: { '&:after': { borderBottomColor: themeTokens.surfaceText } } },
    },
    MuiFilledInput: {
      styleOverrides: { underline: { '&:after': { borderBottomColor: themeTokens.surfaceText } } },
    },
  },
});

export default appTheme;
