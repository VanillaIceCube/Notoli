import '@testing-library/jest-dom';

jest.mock('@mui/material', () => {
  const React = require('react');
  const actual = jest.requireActual('@mui/material');
  return {
    ...actual,
    Menu: ({ open, children }) =>
      open ? React.createElement(actual.MenuList, { 'data-testid': 'menu' }, children) : null,
    TextField: (props) =>
      React.createElement(actual.TextField, {
        ...props,
        autoFocus: false,
      }),
  };
});
