import { useState } from 'react'
import './index.css'
import Login from './pages/Login'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  if (!isAuthenticated) {
    return <Login onLogin={() => setIsAuthenticated(true)} />
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="p-4 bg-primary text-primary-foreground shadow-md">
        <h1 className="text-2xl font-bold">OMNEXA Platform</h1>
      </header>
      <main className="flex-1 p-8">
        <div className="max-w-4xl mx-auto space-y-4">
          <h2 className="text-xl font-semibold">Welcome to your dashboard</h2>
          <p>This is the newly rebuilt Omnexa Retail ERP platform.</p>
        </div>
      </main>
    </div>
  )
}

export default App
