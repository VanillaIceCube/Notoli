import { getSessionVersion } from './services/authentication/sessionState';
import useSession, { useSessionGuard } from './hooks/authentication/useSession';
import useBoardList from './hooks/boards/useBoardList';
import RouteContent from './components/app-core/RouteContent';
import { CssBaseline, ThemeProvider } from '@mui/material';
import appTheme from './theme';
import { lazy, useCallback, useEffect, useState } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router';
import AuthenticatedRoute from './components/app-core/AuthenticatedRoute';
import AppHeader from './components/app-core/AppHeader';
import AppSnackbar from './components/app-core/AppSnackbar';
import BoardNavigationDrawer from './components/app/BoardNavigationDrawer';
import NavigationBridge from './components/app-core/NavigationBridge';
import BoardHomeRedirect from './components/app/BoardHomeRedirect';

const Login = lazy(() => import('./pages/authentication/Login'));
const Register = lazy(() => import('./pages/authentication/Register'));
const ForgotPassword = lazy(() => import('./pages/authentication/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/authentication/ResetPassword'));
const BoardListsPage = lazy(() => import('./pages/boards/BoardListsPage'));
const ListTasksPage = lazy(() => import('./pages/boards/ListTasksPage'));
const ConnectedApps = lazy(() => import('./pages/connections/Connections'));
const OAuthConsent = lazy(() =>
  import('./pages/connections/Connections').then((module) => ({ default: module.OAuthConsent })),
);

function getLocationSignature(location) {
  return `${location.pathname}${location.search}${location.hash}`;
}

function isBoardRoute(pathname) {
  return /^\/board\/[^/]+(?:\/list\/[^/]+)?$/.test(pathname);
}

function BoardRoutes({ setAppBarHeader }) {
  const location = useLocation();
  const currentSignature = getLocationSignature(location);
  const [routeSlots, setRouteSlots] = useState([
    { signature: currentSignature, location, active: true },
  ]);

  useEffect(() => {
    setRouteSlots((slots) => {
      const activeSlot = slots.find((slot) => slot.active) ?? slots[0];
      const activeIsBoardRoute = activeSlot && isBoardRoute(activeSlot.location.pathname);
      const currentIsBoardRoute = isBoardRoute(location.pathname);

      if (!activeSlot || !activeIsBoardRoute || !currentIsBoardRoute) {
        return [{ signature: currentSignature, location, active: true }];
      }

      if (activeSlot.signature === currentSignature) {
        return slots;
      }

      const pendingSlot = slots.find((slot) => slot.signature === currentSignature);
      if (pendingSlot) {
        return slots;
      }

      return [activeSlot, { signature: currentSignature, location, active: false }];
    });
  }, [currentSignature, location]);

  const handlePageReady = useCallback(
    (readySignature) => {
      if (readySignature !== currentSignature) return;

      setRouteSlots((slots) => {
        const readySlot = slots.find((slot) => slot.signature === readySignature);
        if (!readySlot) return slots;
        // Loaded pages may report readiness again after a parent render. Keep
        // the settled state referentially stable so the page effect cannot
        // feed another route update back into itself.
        if (slots.length === 1 && readySlot.active) return slots;

        return slots
          .map((slot) => ({ ...slot, active: slot.signature === readySignature }))
          .filter((slot) => slot.signature === readySignature);
      });
    },
    [currentSignature],
  );

  return routeSlots.map((slot) => (
    <div key={slot.signature} hidden={!slot.active}>
      <RouteContent routeKey={slot.signature} onError={() => handlePageReady(slot.signature)}>
        <Routes location={slot.location}>
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
      </RouteContent>
    </div>
  ));
}

function ApplicationSession({ showSnackbar }) {
  const isCurrentSession = useSessionGuard();
  const boardList = useBoardList();
  // App Bar
  const [appBarHeader, setAppBarHeader] = useState('');

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);

  const showSessionSnackbar = (severity, message) => {
    if (isCurrentSession()) showSnackbar(severity, message);
  };

  return (
    <>
      <NavigationBridge />
      <AppHeader appBarHeader={appBarHeader} setDrawerOpen={setDrawerOpen} />
      <BoardNavigationDrawer
        boardList={boardList}
        open={drawerOpen}
        setDrawerOpen={setDrawerOpen}
        showSnackbar={showSessionSnackbar}
      />
      <RouteContent>
        <Routes>
          <Route
            path="/"
            element={
              <AuthenticatedRoute>
                <BoardHomeRedirect boardList={boardList} showSnackbar={showSnackbar} />
              </AuthenticatedRoute>
            }
          />
          <Route path="/login" element={<Login showSnackbar={showSnackbar} />} />
          <Route path="/register" element={<Register showSnackbar={showSnackbar} />} />
          <Route path="/forgot-password" element={<ForgotPassword showSnackbar={showSnackbar} />} />
          <Route path="/reset-password" element={<ResetPassword showSnackbar={showSnackbar} />} />
          {import.meta.env.VITE_MCP_ENABLED === '1' && (
            <>
              <Route
                path="/connections/authorize"
                element={
                  <AuthenticatedRoute>
                    <OAuthConsent />
                  </AuthenticatedRoute>
                }
              />
              <Route
                path="/connections"
                element={
                  <AuthenticatedRoute>
                    <ConnectedApps />
                  </AuthenticatedRoute>
                }
              />
            </>
          )}

          <Route path="/connections/*" element={<Navigate to="/" replace />} />
          <Route path="*" element={<BoardRoutes setAppBarHeader={setAppBarHeader} />} />
        </Routes>
      </RouteContent>
    </>
  );
}

export default function App() {
  const { version } = useSession();
  const [snackbar, setSnackbar] = useState({ open: false, severity: 'info', message: '', version });
  const showSnackbar = useCallback((severity, message) => {
    setSnackbar({ open: true, severity, message, version: getSessionVersion() });
  }, []);
  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <Router basename={import.meta.env.BASE_URL}>
        <ApplicationSession key={version} showSnackbar={showSnackbar} />
      </Router>
      <AppSnackbar
        open={snackbar.open && snackbar.version === version}
        severity={snackbar.severity}
        message={snackbar.message}
        onClose={(_event, reason) => {
          if (reason !== 'clickaway') setSnackbar((current) => ({ ...current, open: false }));
        }}
      />
    </ThemeProvider>
  );
}
