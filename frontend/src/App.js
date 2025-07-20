import './App.css'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom'
import AuthenticatedRoute from './components/AuthenticatedRoute'
import Login from './pages/authentication/Login'
import Workspaces from './pages/notes/Workspaces'
import TodoLists from './pages/notes/TodoLists'
import Notes from './pages/notes/Notes'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />}/>
        
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
  )
}

export default App
