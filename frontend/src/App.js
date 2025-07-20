import './App.css'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom'
import AuthenticatedRoute from './components/AuthenticatedRoute'
import Login from './pages/authentication/Login'
import Workspaces from './pages/notes/Workspaces'
import TodoLists from './pages/notes/TodoLists'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />}/>
        
        <Route path="/" element=
          {<AuthenticatedRoute><Workspaces /></AuthenticatedRoute>}
        />
        <Route path="/workspaces/:workspaceId" element=
          {<AuthenticatedRoute><TodoLists /></AuthenticatedRoute>}
        />
      </Routes>
    </Router>
  )
}

export default App
