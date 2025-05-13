import './App.css'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom'
import HomePage from './pages/home/HomePage'
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
              <HomePage />
            </AuthenticatedRoute>
          }
        />
      </Routes>
    </Router>
  )
}

export default App
