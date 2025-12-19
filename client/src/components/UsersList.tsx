import React, { useState, useMemo, useEffect } from 'react';
import { User, Warning } from '../types';
import { AlertTriangle, Trash2, Server, QrCode, Search, ArrowUpDown, History, RefreshCw, Users, ShieldCheck, X, Loader2, Inbox } from 'lucide-react';
import { usersApi, Guild } from '../api/users';
import { settingsApi } from '../api/settings';

const STATUS_FILTERS: { value: 'all' | 'verified' | 'muted'; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'verified', label: 'Проверенные' },
  { value: 'muted', label: 'Замьюченные' },
];

type ActionType = 'warn' | 'clear' | 'verify' | 'guilds';

interface Props {
  users: User[];
  refresh: () => void;
  loading?: boolean;
}

export const UsersList: React.FC<Props> = ({ users, refresh, loading = false }) => {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [warnReason, setWarnReason] = useState('');
  const [warnPoints, setWarnPoints] = useState(1);
  
  const [viewGuildsUser, setViewGuildsUser] = useState<User | null>(null);
  const [userGuilds, setUserGuilds] = useState<Guild[]>([]);
  const [loadingGuilds, setLoadingGuilds] = useState(false);
  const [guildsError, setGuildsError] = useState<string | null>(null);

  const [historyUser, setHistoryUser] = useState<User | null>(null);
  const [historyWarnings, setHistoryWarnings] = useState<Warning[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: 'username' | 'status' | 'points'; direction: 'asc' | 'desc' } | null>(null);
  
  const [presets, setPresets] = useState<{id: number, name: string, points: number}[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'muted'>('all');
  const [riskFilter, setRiskFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<{ type: ActionType; userId?: string } | null>(null);
  const [maxPoints, setMaxPoints] = useState(20);

  useEffect(() => {
    settingsApi.getBundle().then(data => {
      if (data.settings?.autoMuteThreshold) {
        setMaxPoints(data.settings.autoMuteThreshold);
      }
    }).catch(console.error);
  }, []);

  const RISK_FILTERS: { value: 'all' | 'low' | 'medium' | 'high'; label: string }[] = [
    { value: 'all', label: 'Все уровни' },
    { value: 'low', label: `< ${Math.floor(maxPoints / 2)} pts` },
    { value: 'medium', label: `${Math.floor(maxPoints / 2)}-${Math.floor(maxPoints * 0.75) - 1} pts` },
    { value: 'high', label: `${Math.floor(maxPoints * 0.75)}+ pts` },
  ];

  useEffect(() => {
    if (selectedUser) {
        usersApi.getPresets().then(setPresets).catch(console.error);
    }
  }, [selectedUser]);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timer);
  }, [feedback]);

  const stats = useMemo(() => {
    const total = users.length;
    const verified = users.filter(user => user.status === 'Verified').length;
    const muted = users.filter(user => user.status === 'Muted').length;
    const unverified = Math.max(0, total - verified);
    const highRisk = users.filter(user => user.points >= Math.floor(maxPoints * 0.75)).length;

    return { total, verified, unverified, muted, highRisk };
  }, [users, maxPoints]);

  const riskMeta: Record<'low' | 'medium' | 'high', { label: string; badgeClass: string }> = {
    low: { label: 'Низкий риск', badgeClass: 'bg-emerald-100 text-emerald-700' },
    medium: { label: 'Нужен контроль', badgeClass: 'bg-amber-100 text-amber-700' },
    high: { label: 'Критический риск', badgeClass: 'bg-rose-100 text-rose-700' },
  };

  const getRiskLevel = (points: number): 'low' | 'medium' | 'high' => {
    if (points >= Math.floor(maxPoints * 0.75)) return 'high';
    if (points >= Math.floor(maxPoints / 2)) return 'medium';
    return 'low';
  };

  const hasActiveFilters = statusFilter !== 'all' || riskFilter !== 'all' || Boolean(searchTerm);

  const clearFilters = () => {
    setStatusFilter('all');
    setRiskFilter('all');
    setSearchTerm('');
  };

  const triggerFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
  };

  const setActionState = (type: ActionType, userId?: string) => {
    setActionLoading({ type, userId });
  };

  const clearActionState = () => setActionLoading(null);

  const isActionLoading = (type: ActionType, userId?: string) => {
    if (!actionLoading) return false;
    if (actionLoading.type !== type) return false;
    if (!userId) return true;
    return actionLoading.userId === userId;
  };

  const handleRefreshClick = async () => {
    setRefreshing(true);
    try {
      await refresh();
      triggerFeedback('success', 'Список участников обновлён');
    } catch (err) {
      console.error(err);
      triggerFeedback('error', 'Не удалось обновить список участников');
    } finally {
      setRefreshing(false);
    }
  };

  const renderRiskBadge = (points: number) => {
    const level = getRiskLevel(points);
    const meta = riskMeta[level];
    return (
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${meta.badgeClass}`}>
        {meta.label}
      </span>
    );
  };

  const handleWarn = async () => {
    if (!selectedUser) return;
    setActionState('warn', selectedUser.id);
    try {
      const warnTarget = selectedUser.username;
      await usersApi.warn(selectedUser.id, warnPoints, warnReason);
      setSelectedUser(null);
      setWarnReason('');
      setWarnPoints(1);
      await refresh();
      triggerFeedback('success', `Предупреждение отправлено: ${warnTarget}`);
    } catch (err) {
      triggerFeedback('error', 'Не удалось выдать предупреждение');
    } finally {
      clearActionState();
    }
  };

  const handleClear = async (userId: string) => {
    if (!confirm('Сбросить все наказания для этого пользователя?')) return;
    setActionState('clear', userId);
    try {
      await usersApi.clear(userId);
      await refresh();
      triggerFeedback('success', 'Наказания очищены');
    } catch (err) {
      triggerFeedback('error', 'Не удалось очистить наказания');
    } finally {
      clearActionState();
    }
  };

  const handleSendVerification = async (userId: string) => {
    if (!confirm('Отправить пользователю новый QR-код в личные сообщения?')) return;
    setActionState('verify', userId);
    try {
      await usersApi.sendVerification(userId);
      triggerFeedback('success', 'DM с QR-кодом отправлен');
    } catch (err) {
      triggerFeedback('error', 'Не удалось отправить сообщение с QR-кодом');
    } finally {
      clearActionState();
    }
  };

  const handleViewGuilds = async (user: User) => {
      setViewGuildsUser(user);
      setLoadingGuilds(true);
      setGuildsError(null);
      setActionState('guilds', user.id);
      try {
          const data = await usersApi.getUserGuilds(user.id);
          setUserGuilds(data);
      } catch (err) {
          console.error(err);
          setUserGuilds([]);
          setGuildsError('Не удалось загрузить серверы пользователя');
          triggerFeedback('error', 'Не удалось загрузить серверы пользователя');
      } finally {
          setLoadingGuilds(false);
          clearActionState();
      }
  };

  const handleSort = (key: 'username' | 'status' | 'points') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const openHistoryModal = async (user: User) => {
    setHistoryUser(user);
    setHistoryWarnings(null);
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      const data = await usersApi.getWarnings(user.id);
      setHistoryWarnings(data.warnings || []);
    } catch (err) {
      console.error(err);
      setHistoryWarnings([]);
      setHistoryError('Failed to load warning history.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const closeHistoryModal = () => {
    setHistoryUser(null);
    setHistoryWarnings(null);
    setHistoryError(null);
  };

  const filteredAndSortedUsers = useMemo(() => {
    let result = [...users];

    if (statusFilter !== 'all') {
      if (statusFilter === 'verified') {
        result = result.filter(user => user.status === 'Verified');
      } else if (statusFilter === 'muted') {
        result = result.filter(user => user.status === 'Muted');
      }
    }

    if (riskFilter !== 'all') {
      result = result.filter(user => getRiskLevel(user.points) === riskFilter);
    }

    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      result = result.filter(user => 
        user.username.toLowerCase().includes(lowerTerm) || 
        user.id.includes(lowerTerm)
      );
    }

    if (sortConfig) {
      result.sort((a, b) => {
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];
        
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [users, searchTerm, sortConfig, statusFilter, riskFilter]);

  const showSkeleton = loading || refreshing;
  const showEmptyState = !showSkeleton && filteredAndSortedUsers.length === 0;

  const getProgressColor = (points: number) => {
    if (points < 10) return 'bg-blue-500';
    if (points < 20) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 border-b border-gray-100 space-y-4">
        {feedback && (
          <div className={`flex items-center gap-3 p-3 rounded-lg border text-sm font-medium ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
              : 'bg-rose-50 text-rose-700 border-rose-100'
          }`}>
            {feedback.type === 'success' ? <ShieldCheck size={18} /> : <AlertTriangle size={18} />}
            <span>{feedback.message}</span>
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex items-center gap-3 flex-1 px-3 py-2 border border-gray-200 rounded-lg focus-within:ring-2 focus-within:ring-blue-500">
            <Search className="text-gray-400" size={18} />
            <input 
              type="text"
              placeholder="Найдите пользователя по имени или ID"
              className="flex-1 outline-none text-gray-700"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRefreshClick}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {refreshing ? <Loader2 size={16} className="text-gray-500 animate-spin" /> : <RefreshCw size={16} className="text-gray-500" />}
              {refreshing ? 'Обновляем...' : 'Обновить'}
            </button>
            <button
              onClick={clearFilters}
              disabled={!hasActiveFilters}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-gray-600 border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <X size={16} />
              Сбросить
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white rounded-lg shadow-sm">
                <Users className="text-blue-600" size={20} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-blue-600">Всего участников</p>
                <p className="text-2xl font-bold text-blue-900">{stats.total}</p>
              </div>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-green-50 border border-green-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white rounded-lg shadow-sm">
                <ShieldCheck className="text-green-600" size={20} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-green-600">Проверенные</p>
                <p className="text-2xl font-bold text-green-900">{stats.verified}</p>
              </div>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white rounded-lg shadow-sm">
                <AlertTriangle className="text-amber-600" size={20} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-amber-600">Под наблюдением</p>
                <p className="text-2xl font-bold text-amber-900">{stats.highRisk}</p>
              </div>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white rounded-lg shadow-sm">
                <Server className="text-gray-600" size={20} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Замьючены</p>
                <p className="text-2xl font-bold text-gray-900">{stats.muted}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Статус</p>
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map(option => (
                <button
                  key={option.value}
                  onClick={() => setStatusFilter(option.value)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    statusFilter === option.value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'text-gray-600 border-gray-200 hover:border-blue-400'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Риск</p>
            <div className="flex flex-wrap gap-2">
              {RISK_FILTERS.map(option => (
                <button
                  key={option.value}
                  onClick={() => setRiskFilter(option.value)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    riskFilter === option.value
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'text-gray-600 border-gray-200 hover:border-amber-400'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th 
                className="p-4 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('username')}
              >
                <div className="flex items-center gap-2">
                  User
                  <ArrowUpDown size={14} />
                </div>
              </th>
              <th 
                className="p-4 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('status')}
              >
                <div className="flex items-center gap-2">
                  Status
                  <ArrowUpDown size={14} />
                </div>
              </th>
              <th 
                className="p-4 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('points')}
              >
                <div className="flex items-center gap-2">
                  Points (Max {maxPoints})
                  <ArrowUpDown size={14} />
                </div>
              </th>
              <th className="p-4 font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {showSkeleton && Array.from({ length: 5 }).map((_, idx) => (
              <tr key={`skeleton-${idx}`} className="animate-pulse">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-200" />
                    <div className="space-y-2 w-full">
                      <div className="h-3 bg-gray-200 rounded w-1/2" />
                      <div className="h-2 bg-gray-100 rounded w-1/4" />
                    </div>
                  </div>
                </td>
                <td className="p-4">
                  <div className="h-5 w-24 bg-gray-100 rounded-full" />
                </td>
                <td className="p-4">
                  <div className="h-2 bg-gray-100 rounded-full" />
                  <div className="h-2 bg-gray-100 rounded-full mt-3 w-1/2" />
                </td>
                <td className="p-4">
                  <div className="flex gap-2">
                    {[0,1,2,3,4].map(key => (
                      <div key={key} className="w-9 h-9 bg-gray-100 rounded-lg" />
                    ))}
                  </div>
                </td>
              </tr>
            ))}

            {!showSkeleton && filteredAndSortedUsers.map(user => (
              <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                <td className="p-4 flex items-center gap-3">
                  <img src={user.avatar} alt="" className="w-10 h-10 rounded-full" />
                  <div>
                    <p className="font-medium text-gray-900">{user.username}</p>
                    <p className="text-xs text-gray-500">Warnings: {user.warningsCount}</p>
                  </div>
                </td>
                <td className="p-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    user.status === 'Verified' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {user.status}
                  </span>
                </td>
                <td className="p-4 w-1/3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${getProgressColor(user.points)} transition-all duration-500`}
                          style={{ width: `${Math.min(100, (user.points / maxPoints) * 100)}%` }}
                        />
                      </div>
                      <span className="text-sm text-gray-600 w-8 text-right font-semibold">{user.points}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      {renderRiskBadge(user.points)}
                      <span className="text-xs text-gray-400">макс. {maxPoints}</span>
                    </div>
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleViewGuilds(user)}
                      disabled={isActionLoading('guilds', user.id)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title="View Servers"
                    >
                      {isActionLoading('guilds', user.id) ? <Loader2 size={18} className="animate-spin" /> : <Server size={18} />}
                    </button>
                    <button 
                      onClick={() => openHistoryModal(user)}
                      className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      title="View History"
                    >
                      <History size={18} />
                    </button>
                    <button 
                      onClick={() => handleSendVerification(user.id)}
                      disabled={isActionLoading('verify', user.id)}
                      className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Send Verification QR"
                    >
                      {isActionLoading('verify', user.id) ? <Loader2 size={18} className="animate-spin" /> : <QrCode size={18} />}
                    </button>
                    <button 
                      onClick={() => setSelectedUser(user)}
                      className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                      title="Warn"
                    >
                      <AlertTriangle size={18} />
                    </button>
                    <button 
                      onClick={() => handleClear(user.id)}
                      disabled={isActionLoading('clear', user.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Clear Punishments"
                    >
                      {isActionLoading('clear', user.id) ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!showSkeleton && showEmptyState && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-gray-500">
                  <div className="flex flex-col items-center gap-3">
                    <Inbox size={32} className="text-gray-400" />
                    <p className="font-medium">
                      {hasActiveFilters ? 'Никто не подходит под выбранные фильтры.' : 'На сервере пока нет данных об участниках.'}
                    </p>
                    {hasActiveFilters ? (
                      <p className="text-sm text-gray-400">Попробуйте сбросить фильтры или изменить запрос.</p>
                    ) : (
                      <p className="text-sm text-gray-400">Нажмите «Обновить», чтобы запросить участников у бота.</p>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Warn Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedUser(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Предупреждение</p>
                <h3 className="text-xl font-bold">{selectedUser.username}</h3>
              </div>
              <button onClick={() => setSelectedUser(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            
            {presets.length > 0 && (
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Presets</label>
                    <div className="flex flex-wrap gap-2">
                        {presets.map(preset => (
                            <button
                                key={preset.id}
                                onClick={() => {
                                    setWarnReason(preset.name);
                                    setWarnPoints(preset.points);
                                }}
                                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-sm text-gray-700 transition-colors"
                            >
                                {preset.name} ({preset.points})
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <input 
                type="text" 
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                value={warnReason}
                onChange={e => setWarnReason(e.target.value)}
                placeholder="e.g. Spamming"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Points</label>
              <input 
                type="number" 
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                value={warnPoints}
                onChange={e => setWarnPoints(Number(e.target.value))}
                min="1"
                max="20"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setSelectedUser(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button 
                onClick={handleWarn}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
              >
                Send Warning
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {historyUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeHistoryModal}>
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Warning History: {historyUser.username}</h3>
              <button onClick={closeHistoryModal} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            {historyLoading ? (
              <p className="text-gray-500 text-center py-8">Loading warnings...</p>
            ) : historyError ? (
              <p className="text-red-500 text-center py-8">{historyError}</p>
            ) : historyWarnings && historyWarnings.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No warnings recorded for this user.</p>
            ) : (
              <div className="space-y-4">
                {(historyWarnings || []).map((warning, idx) => (
                  <div key={idx} className="border border-gray-100 rounded-lg p-4 bg-gray-50">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-semibold text-gray-900">{warning.reason}</span>
                      <span className="text-xs text-gray-500">{new Date(warning.date).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Points: <span className="font-medium text-orange-600">+{warning.points}</span></span>
                      <span className="text-gray-500">By: {warning.moderator || 'System'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Guilds Modal */}
      {viewGuildsUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setViewGuildsUser(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">Servers for {viewGuildsUser.username}</h3>
                <button onClick={() => setViewGuildsUser(null)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
            </div>
            
      {loadingGuilds ? (
        <p>Loading...</p>
      ) : guildsError ? (
        <p className="text-red-500">{guildsError}</p>
      ) : userGuilds.length === 0 ? (
        <p className="text-gray-500">No server data available (User might not be verified via OAuth yet).</p>
      ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {userGuilds.map(guild => (
                        <div key={guild.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-lg">
                            {guild.icon ? (
                                <img 
                                    src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`} 
                                    alt="" 
                                    className="w-10 h-10 rounded-full"
                                />
                            ) : (
                                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-bold">
                                    {guild.name.charAt(0)}
                                </div>
                            )}
                            <div>
                                <p className="font-medium text-gray-900 truncate w-48">{guild.name}</p>
                                {guild.owner && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">Owner</span>}
                            </div>
                        </div>
                    ))}
                </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
