import { useState, useEffect } from 'react'
import DocumentUpload from './components/DocumentUpload'
import CompetitorAnalysis from './components/CompetitorAnalysis'
import Login from './components/Login'
import AuthService from './services/authService'
import { ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline'
import { DocumentProvider } from './context/DocumentContext'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(AuthService.isAuthenticated());

  useEffect(() => {
    setIsAuthenticated(AuthService.isAuthenticated());
  }, []);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    AuthService.logout();
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <DocumentProvider>
      <div className="app-container">
        <header className="app-header">
          <div className="header-content">
            <h1 className="app-title">
              Competitor Analysis GPT
            </h1>
            <button
              onClick={handleLogout}
              className="logout-button"
            >
              <ArrowRightOnRectangleIcon className="logout-icon" style={{ maxWidth: '3%' }} />
              Logout
            </button>
          </div>
        </header>
        <main className="app-main">
          <div className="main-content">
            <div className="content-sections">
              {/* Document Upload Section */}
              <section className="upload-section">
                <DocumentUpload />
              </section>

              {/* Divider */}
              <div className="section-divider"></div>

              {/* Competitor Analysis Section */}
              <section className="analysis-section">
                <CompetitorAnalysis />
              </section>
            </div>
          </div>
        </main>
      </div>
    </DocumentProvider>
  )
}

export default App
