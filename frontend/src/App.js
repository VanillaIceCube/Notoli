import './App.css';
import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import AuthenticatedRoute from './components/AuthenticatedRoute';
import Login from './pages/authentication/Login';
import Register from './pages/authentication/Register';
import Workspaces from './pages/notes/Workspaces';
import TodoLists from './pages/notes/TodoLists';
import Notes from './pages/notes/Notes';
import MyAppBar from './components/MyAppBar';
import MySnackbar from './components/MySnackbar';
import MyDrawer from './components/MyDrawer';

function App() {
  // App Bar
  const [appBarHeader, setAppBarHeader] = useState('');

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerWorkspacesLabel, setDrawerWorkspacesLabel] = useState('');

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

  return (
    <React.Fragment>
      <Router>
        <MyAppBar appBarHeader={
          appBarHeader
        } setDrawerOpen={setDrawerOpen} />

        <MyDrawer
          open={drawerOpen}
          setDrawerOpen={setDrawerOpen}
          drawerWorkspacesLabel={drawerWorkspacesLabel}
          setDrawerWorkspacesLabel={setDrawerWorkspacesLabel}
        />
        <Routes>
          <Route path="/login" element={<Login showSnackbar={showSnackbar} />} />
          <Route path="/register" element={<Register showSnackbar={showSnackbar} />} />

          <React.Fragment>
            <Route
              path="/"
              element={
                <AuthenticatedRoute>
                  <Workspaces setAppBarHeader={setAppBarHeader} />
                </AuthenticatedRoute>
              }
            />

            <Route
              path="/workspace/:workspaceId"
              element={
                <AuthenticatedRoute>
                  <TodoLists setAppBarHeader={setAppBarHeader} />
                </AuthenticatedRoute>
              }
            />

            <Route
              path="/workspace/:workspaceId/todolist/:todoListId"
              element={
                <AuthenticatedRoute>
                  <Notes setAppBarHeader={setAppBarHeader} />
                </AuthenticatedRoute>
              }
            />
          </React.Fragment>
        </Routes>
      </Router>
      <MySnackbar
        open={snackbarOpen}
        severity={snackbarSeverity}
        message={snackbarMessage}
        onClose={handleSnackbarClose}
      />
    </React.Fragment>
  );
}

export default App;
