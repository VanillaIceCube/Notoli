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
import { boardRoute, listRoute, matchBoardPath } from './utils/navigation';
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

function BoardRoutes({ setAppBarHeader }) {
  const location = useLocation();
  const currentSignature = `${location.pathname}${location.search}${location.hash}`;
  // The first page stays visible while the next board or list loads behind it.
  const [routeSlots, setRouteSlots] = useState([{ signature: currentSignature, location }]);

  useEffect(() => {
    setRouteSlots((slots) => {
      const [activeSlot, pendingSlot] = slots;
      if (!matchBoardPath(activeSlot.location.pathname) || !matchBoardPath(location.pathname)) {
        return [{ signature: currentSignature, location }];
      }
      if (
        activeSlot.signature === currentSignature ||
        pendingSlot?.signature === currentSignature
      ) {
        return slots;
      }
      return [activeSlot, { signature: currentSignature, location }];
    });
  }, [currentSignature, location]);

  const handlePageReady = useCallback(
    (readySignature) => {
      if (readySignature !== currentSignature) return;

      setRouteSlots((slots) => {
        const readySlot = slots.find((slot) => slot.signature === readySignature);
        if (!readySlot || slots.length === 1) return slots;
        return [readySlot];
      });
    },
    [currentSignature],
  );

  return routeSlots.map((slot, index) => (
    <div key={slot.signature} hidden={index !== 0}>
      <RouteContent routeKey={slot.signature} onError={() => handlePageReady(slot.signature)}>
        <Routes location={slot.location}>
          <Route
            {...boardRoute}
            element={
              <AuthenticatedRoute>
                <BoardListsPage
                  active={index === 0}
                  onPageReady={() => handlePageReady(slot.signature)}
                  setAppBarHeader={setAppBarHeader}
                />
              </AuthenticatedRoute>
            }
          />

          <Route
            {...listRoute}
            element={
              <AuthenticatedRoute>
                <ListTasksPage
                  active={index === 0}
                  onPageReady={() => handlePageReady(slot.signature)}
                  setAppBarHeader={setAppBarHeader}
                />
              </AuthenticatedRoute>
            }
          />
          <Route path="*" element={<h1>Page not found</h1>} />
        </Routes>
      </RouteContent>
    </div>
  ));
}

function ApplicationSession({ showSnackbar }) {
  const isCurrentSession = useSessionGuard();
  const boardList = useBoardList();
  const connectionsEnabled = import.meta.env.VITE_MCP_ENABLED === '1';
  const [appBarHeader, setAppBarHeader] = useState('');

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
          <Route
            path="/connections/authorize"
            element={
              connectionsEnabled ? (
                <AuthenticatedRoute>
                  <OAuthConsent />
                </AuthenticatedRoute>
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/connections"
            element={
              connectionsEnabled ? (
                <AuthenticatedRoute>
                  <ConnectedApps />
                </AuthenticatedRoute>
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
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
