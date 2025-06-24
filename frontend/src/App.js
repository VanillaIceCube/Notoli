import './App.css'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom'
import Workspaces from './pages/notes/Workspaces'
import Login from './pages/authentication/Login'
import AuthenticatedRoute from './components/AuthenticatedRoute'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />}/>

        <Route path="/" element=
          {
            <AuthenticatedRoute>
              <Workspaces />
            </AuthenticatedRoute>
          }
        />
      </Routes>
    </Router>
  )
}

export default App
