import './App.css';
import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import AuthenticatedRoute from './components/AuthenticatedRoute';
import Login from './pages/authentication/Login';
import Workspaces from './pages/notes/Workspaces';
import TodoLists from './pages/notes/TodoLists';
import Notes from './pages/notes/Notes';
import MySnackbar from './components/MySnackbar';

function App() {

  // Snackbar
  const [snackbarOpen, setSnackbarOpen] = useState(false)
  const [snackbarSeverity, setSnackbarSeverity] = useState('')
  const [snackbarMessage, setSnackbarMessage] = useState('')

  const showSnackbar = (severity, message) => {
    setSnackbarSeverity(severity)
    setSnackbarMessage(message)
    setSnackbarOpen(true)
  }

  const handleSnackbarClose = (_event, reason) => {
    if (reason === 'clickaway') return
    setSnackbarOpen(false)
  }

  return (
    <React.Fragment>
      <Router>
        <Routes>
          <Route path="/login" element={<Login showSnackbar={showSnackbar} />}/>
          
          <Route path="/" element=
            {<AuthenticatedRoute><Workspaces /></AuthenticatedRoute>}
          />

          <Route path="/workspace/:workspaceId" element=
            {<AuthenticatedRoute><TodoLists /></AuthenticatedRoute>}
          />

          <Route path="/workspace/:workspaceId/todolist/:todoListId" element=
            {<AuthenticatedRoute><Notes /></AuthenticatedRoute>}
          />

        </Routes>
      </Router>
      <MySnackbar
        open={snackbarOpen}
        severity={snackbarSeverity}
        message={snackbarMessage}
        onClose={handleSnackbarClose}
      />
    </React.Fragment>
  )
}

export default App
