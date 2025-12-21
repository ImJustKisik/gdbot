import React, { useEffect, useState } from 'react';
import { statsApi } from '../api/stats';
import { invitesApi, Invite, InviteJoin } from '../api/invites';
import { Users, Trophy, Link as LinkIcon, Edit2, Check, X, Eye, Loader2 } from 'lucide-react';

interface InviteStat {
  totalInvites: number;
  topInviters: {
    inviter_id: string;
    count: number;
    username?: string;
    avatar?: string;
  }[];
}

const InvitesStats: React.FC = () => {
  const [stats, setStats] = useState<InviteStat | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingAlias, setEditingAlias] = useState<string | null>(null);
  const [tempAlias, setTempAlias] = useState('');
  
  // Joins Modal State
  const [selectedInvite, setSelectedInvite] = useState<Invite | null>(null);
  const [inviteJoins, setInviteJoins] = useState<InviteJoin[]>([]);
  const [loadingJoins, setLoadingJoins] = useState(false);

  useEffect(() => {
    Promise.all([
      statsApi.getInvites(),
      invitesApi.getAll()
    ])
      .then(([statsData, invitesData]) => {
        setStats(statsData);
        setInvites(invitesData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleStartEdit = (invite: Invite) => {
    setEditingAlias(invite.code);
    setTempAlias(invite.alias || '');
  };

  const handleSaveAlias = async (code: string) => {
    try {
      await invitesApi.setAlias(code, tempAlias);
      setInvites(invites.map(i => i.code === code ? { ...i, alias: tempAlias } : i));
      setEditingAlias(null);
    } catch (error) {
      console.error('Failed to save alias', error);
    }
  };

  const handleViewJoins = async (invite: Invite) => {
    setSelectedInvite(invite);
    setLoadingJoins(true);
    setInviteJoins([]);
    try {
      const data = await invitesApi.getJoins(invite.code);
      setInviteJoins(data);
    } catch (error) {
      console.error('Failed to fetch joins', error);
    } finally {
      setLoadingJoins(false);
    }
  };

  const closeJoinsModal = () => {
    setSelectedInvite(null);
    setInviteJoins([]);
  };

  if (loading) return <div className="animate-pulse h-48 bg-gray-800 rounded-lg"></div>;
  if (!stats) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Total Invites Card */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-200">Total Tracked Invites</h3>
            <Users className="w-6 h-6 text-blue-400" />
          </div>
          <div className="text-4xl font-bold text-white">{stats.totalInvites}</div>
          <p className="text-sm text-gray-400 mt-2">Users joined via tracked invites</p>
        </div>

        {/* Top Inviters Card */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-200">Top Inviters</h3>
            <Trophy className="w-6 h-6 text-yellow-400" />
          </div>
          <div className="space-y-4">
            {stats.topInviters.length === 0 ? (
              <p className="text-gray-400">No invite data yet.</p>
            ) : (
              stats.topInviters.map((inviter, index) => (
                <div key={inviter.inviter_id} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-gray-700 rounded-full font-bold text-gray-300">
                      {index + 1}
                    </div>
                    {inviter.avatar ? (
                      <img src={inviter.avatar} alt={inviter.username} className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center">
                        <span className="text-xs">{inviter.username?.substring(0, 2).toUpperCase()}</span>
                      </div>
                    )}
                    <span className="text-gray-200 font-medium">{inviter.username}</span>
                  </div>
                  <span className="text-blue-400 font-bold">{inviter.count} invites</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Active Invites List */}
      <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 overflow-hidden">
        <div className="p-6 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
            <LinkIcon className="w-5 h-5 text-green-400" />
            Active Invites Management
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-900/50 text-gray-400 text-sm uppercase">
              <tr>
                <th className="px-6 py-3">Code</th>
                <th className="px-6 py-3">Alias</th>
                <th className="px-6 py-3">Uses</th>
                <th className="px-6 py-3">Inviter</th>
                <th className="px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {invites.map((invite) => (
                <tr key={invite.code} className="hover:bg-gray-700/50 transition-colors">
                  <td className="px-6 py-4 font-mono text-blue-400">
                    <a href={invite.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {invite.code}
                    </a>
                  </td>
                  <td className="px-6 py-4">
                    {editingAlias === invite.code ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={tempAlias}
                          onChange={(e) => setTempAlias(e.target.value)}
                          className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-blue-500"
                          placeholder="Enter alias..."
                          autoFocus
                        />
                      </div>
                    ) : (
                      <span className={invite.alias ? "text-white" : "text-gray-500 italic"}>
                        {invite.alias || "No alias"}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-300">
                    <button 
                      onClick={() => handleViewJoins(invite)}
                      className="hover:text-blue-400 hover:underline flex items-center gap-1"
                      disabled={invite.uses === 0}
                    >
                      {invite.uses}
                      {invite.uses > 0 && <Eye size={14} className="opacity-50" />}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    {invite.inviter ? (
                      <div className="flex items-center gap-2">
                        <img src={invite.inviter.avatar} alt="" className="w-6 h-6 rounded-full" />
                        <span className="text-sm text-gray-300">{invite.inviter.username}</span>
                      </div>
                    ) : (
                      <span className="text-gray-500 text-sm">Unknown</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {editingAlias === invite.code ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSaveAlias(invite.code)}
                          className="p-1 text-green-400 hover:bg-green-400/10 rounded"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={() => setEditingAlias(null)}
                          className="p-1 text-red-400 hover:bg-red-400/10 rounded"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleStartEdit(invite)}
                          className="p-1 text-gray-400 hover:text-blue-400 hover:bg-blue-400/10 rounded transition-colors"
                        >
                          <Edit2 size={16} />
                        </button>
                        {invite.uses > 0 && (
                          <button
                            onClick={() => handleViewJoins(invite)}
                            className="p-1 text-gray-400 hover:text-blue-400 hover:bg-blue-400/10 rounded transition-colors"
                            title="View Joins"
                          >
                            <Eye size={16} />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {invites.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No active invites found in this server.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Joins Modal */}
      {selectedInvite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeJoinsModal}>
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[80vh] overflow-y-auto border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold text-white">Invite Details</h3>
                <p className="text-gray-400 text-sm font-mono mt-1">{selectedInvite.code} {selectedInvite.alias && `(${selectedInvite.alias})`}</p>
              </div>
              <button onClick={closeJoinsModal} className="text-gray-400 hover:text-gray-200">
                <X size={20} />
              </button>
            </div>

            {loadingJoins ? (
              <div className="flex justify-center py-12">
                <Loader2 size={32} className="animate-spin text-blue-500" />
              </div>
            ) : inviteJoins.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No recorded joins for this invite.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-900/50 text-gray-400 text-sm uppercase">
                    <tr>
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Joined At</th>
                      <th className="px-4 py-3">Points</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {inviteJoins.map((join) => (
                      <tr key={join.id} className="hover:bg-gray-700/30">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {join.avatar ? (
                              <img src={join.avatar} alt="" className="w-8 h-8 rounded-full" />
                            ) : (
                              <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center">
                                <span className="text-xs text-white">{join.username.substring(0, 2).toUpperCase()}</span>
                              </div>
                            )}
                            <div>
                              <p className="font-medium text-gray-200">{join.username}</p>
                              <p className="text-xs text-gray-500 font-mono">{join.id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-300 text-sm">
                          {new Date(join.joinedAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            join.points > 10 ? 'bg-red-900/50 text-red-400' : 
                            join.points > 0 ? 'bg-yellow-900/50 text-yellow-400' : 
                            'bg-green-900/50 text-green-400'
                          }`}>
                            {join.points} pts
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default InvitesStats;
