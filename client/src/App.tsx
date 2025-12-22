import { useState, useEffect } from 'react';
import { LayoutDashboard, ShieldCheck, Menu, LogOut, LogIn, Settings, X, List, Share2, MessageSquare } from 'lucide-react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { DashboardStats } from './components/DashboardStats';
import { AnalyticsView } from './components/AnalyticsView';
import { UsersList } from './components/UsersList';
import { VerificationView } from './components/VerificationView';
import { SettingsView } from './components/SettingsView';
import { LogsView } from './components/LogsView';
import EmbedBuilder from './components/EmbedBuilder';
import { ErrorBoundary } from './components/ErrorBoundary';
import InvitesStats from './components/InvitesStats';
import { RecentActivity } from './components/RecentActivity';
import { User } from './types';
import { authApi } from './api/auth';
import { usersApi } from './api/users';

interface AuthUser {
  id: string;
  username: string;
  avatar: string;
  isAdmin: boolean;
}

function App() {
  const location = useLocation();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Check Auth Status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const data = await authApi.getMe();
        if (data.authenticated) {
          setIsAuthenticated(true);
          setCurrentUser(data.user);
        } else {
          setIsAuthenticated(false);
        }
      } catch (err) {
        setIsAuthenticated(false);
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, []);

  const fetchUsers = async () => {
    if (!isAuthenticated) return;
    try {
      const data = await usersApi.getAll();
      if (Array.isArray(data)) {
        setUsers(data);
        setError(null);
      } else {
        console.error('Invalid users data:', data);
        setUsers([]);
      }
    } catch (err) {
      console.error(err);
      if (loading) setError('Failed to connect to server. Please ensure the bot is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchUsers();
      const interval = setInterval(fetchUsers, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  const handleLogin = () => {
    authApi.login();
  };

  const handleLogout = async () => {
    await authApi.logout();
    window.location.reload();
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8 bg-white rounded-xl shadow-lg max-w-md w-full">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-blue-50 rounded-full">
              <ShieldCheck className="w-12 h-12 text-blue-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Discord Guardian</h2>
          <p className="text-gray-500 mb-8">Please log in with Discord to access the moderation dashboard.</p>
          
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-[#5865F2] text-white rounded-xl hover:bg-[#4752C4] transition-colors font-medium"
          >
            <LogIn size={20} />
            Login with Discord
          </button>
        </div>
      </div>
    );
  }

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
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden" 
          onClick={() => setIsMobileMenuOpen(false)} 
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out md:translate-x-0 md:static md:flex flex-col
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <ShieldCheck className="text-blue-600" />
            Discord Guardian
          </h1>
          <button className="md:hidden text-gray-500" onClick={() => setIsMobileMenuOpen(false)}>
            <X size={24} />
          </button>
        </div>
        
        <div className="p-4">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg mb-4">
            <img src={currentUser?.avatar} alt="" className="w-10 h-10 rounded-full" />
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-gray-900 truncate">{currentUser?.username}</p>
              <p className="text-xs text-gray-500">Administrator</p>
            </div>
          </div>
        </div>

        <nav className="px-4 space-y-2 flex-1">
          <Link 
            to="/"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              location.pathname === '/' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <LayoutDashboard size={20} />
            Dashboard
          </Link>
          <Link 
            to="/verification"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              location.pathname === '/verification' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <ShieldCheck size={20} />
            Verification
          </Link>
          <Link 
            to="/settings"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              location.pathname === '/settings' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Settings size={20} />
            Settings
          </Link>
          <Link 
            to="/logs"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              location.pathname === '/logs' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <List size={20} />
            Audit Logs
          </Link>
          <Link 
            to="/embeds"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              location.pathname === '/embeds' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <MessageSquare size={20} />
            Embed Builder
          </Link>
          <Link 
            to="/invites"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              location.pathname === '/invites' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Share2 size={20} />
            Invites
          </Link>
        </nav>

        <div className="p-4 border-t border-gray-100">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut size={20} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        <header className="flex justify-between items-center mb-8 md:hidden">
          <h1 className="text-xl font-bold text-gray-800">Discord Guardian</h1>
          <button className="p-2 text-gray-600" onClick={() => setIsMobileMenuOpen(true)}>
            <Menu />
          </button>
        </header>

        <Routes>
          <Route path="/" element={
            <>
              <div className="mb-8 flex justify-between items-end">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">Dashboard</h2>
                  <p className="text-gray-500">Server overview and moderation tools</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                <div className="lg:col-span-2 space-y-8">
                  <DashboardStats users={users} />
                </div>
                <div className="lg:col-span-1">
                  <RecentActivity />
                </div>
              </div>
              
              <ErrorBoundary>
                <AnalyticsView />
              </ErrorBoundary>

              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Member Management</h3>
                <UsersList users={users} refresh={fetchUsers} />
              </div>
            </>
          } />
          <Route path="/verification" element={<VerificationView />} />
          <Route path="/embeds" element={<EmbedBuilder />} />
          <Route path="/invites" element={
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-800">Invite Tracking</h2>
                <p className="text-gray-500">Monitor server invites and join statistics</p>
              </div>
              <InvitesStats />
            </>
          } />
          <Route path="/settings" element={<SettingsView />} />
          <Route path="/logs" element={<LogsView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
