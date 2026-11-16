import { createTheme } from '@mui/material/styles';

// The theme owns these colors; CssBaseline exposes the existing variables for
// component-specific styles and the remaining document CSS.
const colors = {
  background: '#1a1a1a',
  surface: '#f5e79e',
  control: '#555555',
  text: '#ffffff',
};
const documentFont =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif';

const overlayPaper = ({ theme }) => ({
  color: colors.control,
  border: `2.5px solid ${colors.background}`,
  borderRadius: 6,
  boxShadow: theme.shadows[3],
});

const notoliTheme = createTheme({
  // Controls sit on pale surfaces. A dark document does not require dark inputs.
  palette: {
    mode: 'light',
    primary: { main: colors.control, contrastText: colors.text },
    background: { default: colors.background, paper: colors.surface },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ':root': {
          '--background-color': colors.background,
          '--secondary-background-color': colors.surface,
          '--secondary-color': colors.control,
          '--text-color': colors.text,
        },
        // Preserve the existing page dimensions and system document typography;
        // individual MUI controls retain their standard Roboto typography.
        html: { boxSizing: 'content-box' },
        body: {
          fontFamily: documentFont,
          lineHeight: 'normal',
          letterSpacing: 'normal',
          color: colors.text,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: { backgroundColor: colors.background, color: colors.surface, boxShadow: 'none' },
      },
    },
    MuiDrawer: {
      styleOverrides: { paper: { color: colors.control } },
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
          variants: [{ props: { variant: 'outlined' }, style: { backgroundColor: colors.text } }],
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: { root: { '&.Mui-focused': { color: colors.control } } },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: colors.control },
        },
      },
    },
    MuiInput: {
      styleOverrides: { underline: { '&:after': { borderBottomColor: colors.control } } },
    },
    MuiFilledInput: {
      styleOverrides: { underline: { '&:after': { borderBottomColor: colors.control } } },
    },
  },
});

export default notoliTheme;
