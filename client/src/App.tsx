import { useState, useEffect, useMemo } from 'react';
import { LayoutDashboard, ShieldCheck, Menu, LogOut, LogIn, Settings, X, List, Share2, MessageSquare, Cpu, RefreshCw, SunMedium, Moon, Sparkles } from 'lucide-react';
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
import { AiMonitorView } from './components/AiMonitorView';
import { User } from './types';
import { authApi } from './api/auth';
import { usersApi } from './api/users';
import { useTheme } from './hooks/useTheme';

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
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const { theme, toggleTheme } = useTheme();

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
        setLastSyncedAt(new Date());
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

  const handleManualRefresh = async () => {
    setIsSyncing(true);
    try {
      await fetchUsers();
    } finally {
      setIsSyncing(false);
    }
  };

  const lastSyncLabel = useMemo(() => {
    if (!lastSyncedAt) return 'Нет данных о синхронизации';
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(lastSyncedAt);
  }, [lastSyncedAt]);

  const handleLogin = () => {
    authApi.login();
  };

  const handleLogout = async () => {
    await authApi.logout();
    window.location.reload();
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-900 via-slate-950 to-black">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-black px-4">
        <div className="text-center p-8 glass-panel max-w-md w-full">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-blue-500/10 rounded-full">
              <ShieldCheck className="w-12 h-12 text-blue-400" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Discord Guardian</h2>
          <p className="text-slate-300 mb-8">Please log in with Discord to access the moderation dashboard.</p>
          
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-black px-4">
        <div className="text-center p-8 glass-panel max-w-md">
          <h2 className="text-2xl font-bold text-red-400 mb-4">Connection Error</h2>
          <p className="text-slate-200 mb-6">{error}</p>
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
    <div className={theme === 'dark' ? 'dark' : ''}>
      <div className="min-h-screen bg-[var(--color-background)] flex text-gray-900 dark:text-slate-100 transition-colors duration-300">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-20 md:hidden" 
          onClick={() => setIsMobileMenuOpen(false)} 
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-30 w-72 bg-white/80 dark:bg-slate-950/70 border-r border-gray-200/80 dark:border-white/5 backdrop-blur-xl transform transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:flex flex-col shadow-2xl/50
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 border-b border-gray-100/70 dark:border-white/5 flex justify-between items-center">
          <h1 className="text-xl font-bold flex items-center gap-2 text-gray-800 dark:text-white">
            <ShieldCheck className="text-blue-600 dark:text-blue-400" />
            Discord Guardian
          </h1>
          <button className="md:hidden text-gray-500 dark:text-gray-300" onClick={() => setIsMobileMenuOpen(false)}>
            <X size={24} />
          </button>
        </div>
        
        <div className="p-4">
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-white/80 dark:bg-white/5 border border-gray-100/70 dark:border-white/10 mb-4 shadow-sm">
            <img src={currentUser?.avatar} alt="" className="w-11 h-11 rounded-2xl object-cover" />
            <div className="overflow-hidden">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{currentUser?.username}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Administrator</p>
            </div>
            <button 
              className="ml-auto p-2 rounded-full bg-gray-100/80 dark:bg-white/10 text-gray-600 dark:text-gray-200"
              onClick={toggleTheme}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <SunMedium size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>

        <nav className="px-4 space-y-2 flex-1">
          <Link 
            to="/"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`nav-pill ${
              location.pathname === '/' ? 'bg-blue-100/70 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'text-gray-600 dark:text-gray-300'
            }`}
          >
            <LayoutDashboard size={20} />
            Dashboard
          </Link>
          <Link 
            to="/verification"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`nav-pill ${
              location.pathname === '/verification' ? 'bg-blue-100/70 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'text-gray-600 dark:text-gray-300'
            }`}
          >
            <ShieldCheck size={20} />
            Verification
          </Link>
          <Link 
            to="/settings"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`nav-pill ${
              location.pathname === '/settings' ? 'bg-blue-100/70 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'text-gray-600 dark:text-gray-300'
            }`}
          >
            <Settings size={20} />
            Settings
          </Link>
          <Link 
            to="/logs"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`nav-pill ${
              location.pathname === '/logs' ? 'bg-blue-100/70 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'text-gray-600 dark:text-gray-300'
            }`}
          >
            <List size={20} />
            Audit Logs
          </Link>
          <Link 
            to="/embeds"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`nav-pill ${
              location.pathname === '/embeds' ? 'bg-blue-100/70 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'text-gray-600 dark:text-gray-300'
            }`}
          >
            <MessageSquare size={20} />
            Embed Builder
          </Link>
          <Link 
            to="/invites"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`nav-pill ${
              location.pathname === '/invites' ? 'bg-blue-100/70 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'text-gray-600 dark:text-gray-300'
            }`}
          >
            <Share2 size={20} />
            Invites
          </Link>
          <Link 
            to="/ai-monitor"
            onClick={() => setIsMobileMenuOpen(false)}
            className={`nav-pill ${
              location.pathname === '/ai-monitor' ? 'bg-blue-100/70 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'text-gray-600 dark:text-gray-300'
            }`}
          >
            <Cpu size={20} />
            AI Usage
          </Link>
        </nav>

        <div className="p-4 border-t border-gray-100/70 dark:border-white/5">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-600 dark:text-red-400 hover:bg-red-50/70 dark:hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <LogOut size={20} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
        <header className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <button className="md:hidden p-2 text-gray-600 dark:text-gray-300" onClick={() => setIsMobileMenuOpen(true)}>
              <Menu />
            </button>
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400">Control center</p>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">Discord Guardian</h1>
            </div>
            <span className="hidden md:inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Bot online
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleManualRefresh}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/70 border border-gray-100 text-sm font-semibold text-gray-700 shadow-sm hover:-translate-y-0.5 transition-all dark:bg-white/5 dark:text-gray-200 dark:border-white/10"
              disabled={isSyncing}
            >
              <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
              {isSyncing ? 'Refreshing' : 'Refresh data'}
            </button>
            <button
              onClick={toggleTheme}
              className="p-3 rounded-xl bg-white/70 border border-gray-100 shadow-sm text-gray-700 dark:bg-white/5 dark:text-gray-200 dark:border-white/10"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <SunMedium size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        <Routes>
          <Route path="/" element={
            <>
              <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-panel p-6">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Last synced</p>
                  <p className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{lastSyncLabel}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center gap-1">
                      <span className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`}></span>
                      {isSyncing ? 'Sync in progress' : 'Realtime updates' }
                    </span>
                    <span>•</span>
                    <button className="underline text-blue-600 dark:text-blue-300" onClick={handleManualRefresh}>Force sync</button>
                  </div>
                </div>
                <div className="glass-panel p-6">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Quick actions</p>
                  <div className="flex flex-wrap gap-3">
                    <Link to="/verification" className="px-4 py-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-300 text-sm font-semibold">
                      Verification
                    </Link>
                    <Link to="/ai-monitor" className="px-4 py-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-300 text-sm font-semibold">
                      AI Monitor
                    </Link>
                    <Link to="/logs" className="px-4 py-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-300 text-sm font-semibold">
                      Logs
                    </Link>
                  </div>
                </div>
                <div className="glass-panel p-6 flex items-center gap-4">
                  <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-500">
                    <Sparkles />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">AI Insights</p>
                    <p className="font-semibold text-gray-900 dark:text-white">Monitor toxicity + auto-actions</p>
                    <Link to="/ai-monitor" className="text-xs text-blue-600 dark:text-blue-300 underline">Open AI Usage</Link>
                  </div>
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
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Member Management</h3>
                <UsersList users={users} refresh={fetchUsers} />
              </div>
            </>
          } />
          <Route path="/verification" element={<VerificationView />} />
          <Route path="/embeds" element={<EmbedBuilder />} />
          <Route path="/invites" element={
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Invite Tracking</h2>
                <p className="text-gray-500 dark:text-gray-400">Monitor server invites and join statistics</p>
              </div>
              <InvitesStats />
            </>
          } />
          <Route path="/ai-monitor" element={<AiMonitorView />} />
          <Route path="/settings" element={<SettingsView />} />
          <Route path="/logs" element={<LogsView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      </div>
    </div>
  );
}

export default App;
