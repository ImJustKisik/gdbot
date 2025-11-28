import React, { useState, useMemo, useEffect } from 'react';
import { User } from '../types';
import { AlertTriangle, Trash2, Server, QrCode, Search, ArrowUpDown, History } from 'lucide-react';
import axios from 'axios';

interface Props {
  users: User[];
  refresh: () => void;
}

interface Guild {
    id: string;
    name: string;
    icon: string;
    owner: boolean;
}

export const UsersList: React.FC<Props> = ({ users, refresh }) => {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [warnReason, setWarnReason] = useState('');
  const [warnPoints, setWarnPoints] = useState(1);
  
  const [viewGuildsUser, setViewGuildsUser] = useState<User | null>(null);
  const [userGuilds, setUserGuilds] = useState<Guild[]>([]);
  const [loadingGuilds, setLoadingGuilds] = useState(false);

  const [historyUser, setHistoryUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: 'username' | 'status' | 'points'; direction: 'asc' | 'desc' } | null>(null);
  
  const [presets, setPresets] = useState<{id: number, name: string, points: number}[]>([]);

  useEffect(() => {
    if (selectedUser) {
        axios.get('/api/presets').then(res => setPresets(res.data)).catch(console.error);
    }
  }, [selectedUser]);

  const handleWarn = async () => {
    if (!selectedUser) return;
    try {
      await axios.post('/api/warn', {
        userId: selectedUser.id,
        points: warnPoints,
        reason: warnReason
      });
      setSelectedUser(null);
      setWarnReason('');
      setWarnPoints(1);
      refresh();
    } catch (err) {
      alert('Failed to warn user');
    }
  };

  const handleClear = async (userId: string) => {
    if (!confirm('Are you sure you want to clear all punishments?')) return;
    try {
      await axios.post('/api/clear', { userId });
      refresh();
    } catch (err) {
      alert('Failed to clear punishments');
    }
  };

  const handleSendVerification = async (userId: string) => {
    if (!confirm('Send verification QR code to this user via DM?')) return;
    try {
      await axios.post('/api/verify/send-dm', { userId });
      alert('Verification DM sent!');
    } catch (err) {
      alert('Failed to send verification DM');
    }
  };

  const handleViewGuilds = async (user: User) => {
      setViewGuildsUser(user);
      setLoadingGuilds(true);
      try {
          const res = await axios.get(`/api/user/${user.id}/guilds`);
          setUserGuilds(res.data);
      } catch (err) {
          console.error(err);
          setUserGuilds([]);
      } finally {
          setLoadingGuilds(false);
      }
  };

  const handleSort = (key: 'username' | 'status' | 'points') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredAndSortedUsers = useMemo(() => {
    let result = [...users];

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
  }, [users, searchTerm, sortConfig]);

  const getProgressColor = (points: number) => {
    if (points < 10) return 'bg-blue-500';
    if (points < 20) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Search Bar */}
      <div className="p-4 border-b border-gray-100 flex items-center gap-3">
        <Search className="text-gray-400" size={20} />
        <input 
          type="text"
          placeholder="Search users by name or ID..."
          className="flex-1 outline-none text-gray-700"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
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
                  Points (Max 20)
                  <ArrowUpDown size={14} />
                </div>
              </th>
              <th className="p-4 font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredAndSortedUsers.map(user => (
              <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                <td className="p-4 flex items-center gap-3">
                  <img src={user.avatar} alt="" className="w-10 h-10 rounded-full" />
                  <span className="font-medium text-gray-900">{user.username}</span>
                </td>
                <td className="p-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    user.status === 'Verified' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {user.status}
                  </span>
                </td>
                <td className="p-4 w-1/3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${getProgressColor(user.points)} transition-all duration-500`}
                        style={{ width: `${Math.min(100, (user.points / 20) * 100)}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-500 w-8">{user.points}</span>
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleViewGuilds(user)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="View Servers"
                    >
                      <Server size={18} />
                    </button>
                    <button 
                      onClick={() => setHistoryUser(user)}
                      className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      title="View History"
                    >
                      <History size={18} />
                    </button>
                    <button 
                      onClick={() => handleSendVerification(user.id)}
                      className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                      title="Send Verification QR"
                    >
                      <QrCode size={18} />
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
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Clear Punishments"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredAndSortedUsers.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-gray-500">
                  No users found matching "{searchTerm}"
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Warn Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-xl font-bold mb-4">Warn {selectedUser.username}</h3>
            
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Warning History: {historyUser.username}</h3>
              <button onClick={() => setHistoryUser(null)} className="text-gray-500 hover:text-gray-700">Close</button>
            </div>

            {historyUser.warnings.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No warnings recorded for this user.</p>
            ) : (
              <div className="space-y-4">
                {historyUser.warnings.map((warning, idx) => (
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">Servers for {viewGuildsUser.username}</h3>
                <button onClick={() => setViewGuildsUser(null)} className="text-gray-500 hover:text-gray-700">Close</button>
            </div>
            
            {loadingGuilds ? (
                <p>Loading...</p>
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
