import React from 'react';
import ReactDOM from 'react-dom/client';

jest.mock('./App', () => () => <div>AppRoot</div>);

describe('index', () => {
  test('when the app boots, it mounts App into the root element', () => {
    document.body.innerHTML = '<div id="root"></div>';

    const render = jest.fn();
    ReactDOM.createRoot = jest.fn(() => ({ render }));

    require('./index');

    expect(ReactDOM.createRoot).toHaveBeenCalledWith(document.getElementById('root'));
    expect(render).toHaveBeenCalled();
  });
});
