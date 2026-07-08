import './App.css';
import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import AuthenticatedRoute from './components/AuthenticatedRoute';
import Login from './pages/authentication/Login';
import Register from './pages/authentication/Register';
import ForgotPassword from './pages/authentication/ForgotPassword';
import ResetPassword from './pages/authentication/ResetPassword';
import BoardListsPage from './pages/boards/BoardListsPage';
import ListTasksPage from './pages/lists/ListTasksPage';
import AppHeader from './components/AppHeader';
import AppSnackbar from './components/AppSnackbar';
import BoardNavigationDrawer from './components/BoardNavigationDrawer';
import NavigationBridge from './components/NavigationBridge';
import BoardHomeRedirect from './components/BoardHomeRedirect';

function App() {
  // App Bar
  const [appBarHeader, setAppBarHeader] = useState('');

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerBoardsLabel, setDrawerBoardsLabel] = useState('');

  // Snackbar
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarSeverity, setSnackbarSeverity] = useState('');
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const showSnackbar = (severity, message) => {
    setSnackbarSeverity(severity);
    setSnackbarMessage(message);
    setSnackbarOpen(true);
  };

  const handleSnackbarClose = (_event, reason) => {
    if (reason === 'clickaway') return;
    setSnackbarOpen(false);
  };

  const routerBasename = process.env.PUBLIC_URL || '/';

  return (
    <React.Fragment>
      <Router basename={routerBasename}>
        <NavigationBridge />
        <AppHeader appBarHeader={appBarHeader} setDrawerOpen={setDrawerOpen} />
        <BoardNavigationDrawer
          open={drawerOpen}
          setDrawerOpen={setDrawerOpen}
          drawerBoardsLabel={drawerBoardsLabel}
          setDrawerBoardsLabel={setDrawerBoardsLabel}
          showSnackbar={showSnackbar}
        />
        <Routes>
          <Route path="/login" element={<Login showSnackbar={showSnackbar} />} />
          <Route path="/register" element={<Register showSnackbar={showSnackbar} />} />
          <Route path="/forgot-password" element={<ForgotPassword showSnackbar={showSnackbar} />} />
          <Route path="/reset-password" element={<ResetPassword showSnackbar={showSnackbar} />} />

          <React.Fragment>
            <Route
              path="/"
              element={
                <AuthenticatedRoute>
                  <BoardHomeRedirect />
                </AuthenticatedRoute>
              }
            />

            <Route
              path="/board/:boardId"
              element={
                <AuthenticatedRoute>
                  <BoardListsPage setAppBarHeader={setAppBarHeader} />
                </AuthenticatedRoute>
              }
            />

            <Route
              path="/board/:boardId/list/:listId"
              element={
                <AuthenticatedRoute>
                  <ListTasksPage setAppBarHeader={setAppBarHeader} />
                </AuthenticatedRoute>
              }
            />
          </React.Fragment>
        </Routes>
      </Router>
      <AppSnackbar
        open={snackbarOpen}
        severity={snackbarSeverity}
        message={snackbarMessage}
        onClose={handleSnackbarClose}
      />
    </React.Fragment>
  );
}

export default App;
