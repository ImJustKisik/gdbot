import { useState, useEffect } from 'react';
import axios from 'axios';
import { LayoutDashboard, ShieldCheck, Menu } from 'lucide-react';
import { DashboardStats } from './components/DashboardStats';
import { UsersList } from './components/UsersList';
import { VerificationView } from './components/VerificationView';
import { User } from './types';

function App() {
  const [view, setView] = useState<'dashboard' | 'verification'>('dashboard');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      const res = await axios.get('/api/users');
      setUsers(res.data);
      setError(null);
    } catch (err) {
      console.error(err);
      // Don't set error immediately on first load if it fails, maybe just empty list or retry
      // But for this demo, let's show error if it persists
      if (loading) setError('Failed to connect to server. Please ensure the bot is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    const interval = setInterval(fetchUsers, 10000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8 bg-white rounded-xl shadow-lg max-w-md">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Connection Error</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button 
            onClick={() => { setError(null); setLoading(true); fetchUsers(); }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col">
        <div className="p-6 border-b border-gray-100">
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <ShieldCheck className="text-blue-600" />
            Discord Guardian
          </h1>
        </div>
        <nav className="p-4 space-y-2">
          <button 
            onClick={() => setView('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              view === 'dashboard' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <LayoutDashboard size={20} />
            Dashboard
          </button>
          <button 
            onClick={() => setView('verification')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              view === 'verification' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <ShieldCheck size={20} />
            Verification
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        <header className="flex justify-between items-center mb-8 md:hidden">
          <h1 className="text-xl font-bold text-gray-800">Discord Guardian</h1>
          <button className="p-2 text-gray-600"><Menu /></button>
        </header>

        {view === 'dashboard' ? (
          <>
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-800">Dashboard</h2>
              <p className="text-gray-500">Server overview and moderation tools</p>
            </div>
            
            <DashboardStats users={users} />
            
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Member Management</h3>
              <UsersList users={users} refresh={fetchUsers} />
            </div>
          </>
        ) : (
          <VerificationView />
        )}
      </main>
    </div>
  );
}

export default App;
