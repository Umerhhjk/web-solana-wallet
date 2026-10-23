// src/App.tsx
import { BrowserRouter as Router, Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { SetupScreen } from './components/SetupScreen';
import { DashboardScreen } from './components/DashboardScreen';

const WelcomeScreen = () => {
  const navigate = useNavigate();
  const hasVault = !!localStorage.getItem('wallet_vault');

  if (hasVault) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-4xl font-bold mb-6 text-purple-500">Vault Wallet</h1>
      <p className="mb-8 text-gray-400">A secure, non-custodial Solana web wallet.</p>
      <button onClick={() => navigate('/setup')} className="bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded-lg font-semibold transition">
        Enter Vault
      </button>
    </div>
  );
};

function App() {
  return (
    <Router>
      <div className="bg-gray-900 text-white font-sans min-h-screen">
        <Routes>
          <Route path="/" element={<WelcomeScreen />} />
          <Route path="/setup" element={<SetupScreen />} />
          <Route path="/dashboard" element={<DashboardScreen />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;