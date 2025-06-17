import './App.css'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom'
import TodoLists from './pages/notes/TodoLists'
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
              <TodoLists />
            </AuthenticatedRoute>
          }
        />
      </Routes>
    </Router>
  )
}

export default App
