import React, { useEffect, useState } from 'react';
import { statsApi } from '../api/stats';
import { Users, Trophy } from 'lucide-react';

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    statsApi.getInvites()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse h-48 bg-gray-800 rounded-lg"></div>;
  if (!stats) return null;

  return (
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
  );
};

export default InvitesStats;
