import { HomePage } from './pages/HomePage/HomePage'
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary'

function App() {
  return (
    <ErrorBoundary>
      <HomePage />
    </ErrorBoundary>
  )
}

export default App