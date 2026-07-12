import './App.css';
import React, { useCallback, useEffect, useState } from 'react';
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
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

function getLocationSignature(location) {
  return `${location.pathname}${location.search}${location.hash}`;
}

function isNotepadRoute(pathname) {
  return pathname === '/' || /^\/board\/[^/]+(?:\/list\/[^/]+)?$/.test(pathname);
}

function NotepadRoutes({ setAppBarHeader }) {
  const location = useLocation();
  const currentSignature = getLocationSignature(location);
  const [routeSlots, setRouteSlots] = useState([
    { signature: currentSignature, location, active: true },
  ]);

  useEffect(() => {
    setRouteSlots((slots) => {
      const activeSlot = slots.find((slot) => slot.active) ?? slots[0];
      const activeIsNotepadRoute = activeSlot && isNotepadRoute(activeSlot.location.pathname);
      const currentIsNotepadRoute = isNotepadRoute(location.pathname);

      if (!activeSlot || !activeIsNotepadRoute || !currentIsNotepadRoute) {
        return [{ signature: currentSignature, location, active: true }];
      }

      if (activeSlot.signature === currentSignature) {
        return slots;
      }

      const pendingSlot = slots.find((slot) => slot.signature === currentSignature);
      if (pendingSlot) {
        return slots;
      }

      return [
        activeSlot,
        { signature: currentSignature, location, active: false },
      ];
    });
  }, [currentSignature, location]);

  const handlePageReady = useCallback(
    (readySignature) => {
      if (readySignature !== currentSignature) return;

      setRouteSlots((slots) => {
        const readySlot = slots.find((slot) => slot.signature === readySignature);
        if (!readySlot) return slots;

        return slots
          .map((slot) => ({ ...slot, active: slot.signature === readySignature }))
          .filter((slot) => slot.signature === readySignature);
      });
    },
    [currentSignature],
  );

  return routeSlots.map((slot) => (
    <div key={slot.signature} hidden={!slot.active}>
      <Routes location={slot.location}>
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
              <BoardListsPage
                active={slot.active}
                onPageReady={() => handlePageReady(slot.signature)}
                setAppBarHeader={setAppBarHeader}
              />
            </AuthenticatedRoute>
          }
        />

        <Route
          path="/board/:boardId/list/:listId"
          element={
            <AuthenticatedRoute>
              <ListTasksPage
                active={slot.active}
                onPageReady={() => handlePageReady(slot.signature)}
                setAppBarHeader={setAppBarHeader}
              />
            </AuthenticatedRoute>
          }
        />
      </Routes>
    </div>
  ));
}

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

          <Route path="*" element={<NotepadRoutes setAppBarHeader={setAppBarHeader} />} />
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
