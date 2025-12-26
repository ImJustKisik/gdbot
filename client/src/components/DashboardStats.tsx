import React, { useMemo, useEffect, useState } from 'react';
import { Users, ShieldAlert, MicOff } from 'lucide-react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { User } from '../types';
import { statsApi } from '../api/stats';

interface Props {
  users: User[];
}

export const DashboardStats: React.FC<Props> = ({ users }) => {
  const totalUsers = users.length;
  const mutedUsers = users.filter(u => u.status === 'Muted').length;
  const totalWarns = useMemo(() => users.reduce((acc, u) => acc + (u.warningsCount || 0), 0), [users]);

  const [weeklyData, setWeeklyData] = useState(
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(name => ({ name, warns: 0 }))
  );

  useEffect(() => {
    let cancelled = false;

    const loadActivity = async () => {
      try {
        const data = await statsApi.getActivity();
        if (!Array.isArray(data) || cancelled) return;

        const today = new Date();
        const currentDay = today.getDay();
        const diff = today.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
        const monday = new Date(today);
        monday.setDate(diff);
        monday.setHours(0, 0, 0, 0);

        const counts = new Array(7).fill(0);
        data.forEach((row: { day: string; count: number }) => {
          const statDate = new Date(row.day);
          statDate.setHours(0, 0, 0, 0);
          if (statDate < monday) return;
          const dayDiff = Math.floor((statDate.getTime() - monday.getTime()) / (1000 * 60 * 60 * 24));
          if (dayDiff >= 0 && dayDiff < 7) {
            counts[dayDiff] += row.count;
          }
        });

        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        if (!cancelled) {
          setWeeklyData(days.map((name, i) => ({ name, warns: counts[i] })));
        }
      } catch (error) {
        console.error('Failed to load activity stats', error);
      }
    };

    loadActivity();
    const interval = setInterval(loadActivity, 60000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      <div className="glass-panel p-6 flex items-center">
        <div className="p-3 bg-blue-500/10 rounded-lg mr-4">
          <Users className="text-blue-600 dark:text-blue-400 w-6 h-6" />
        </div>
        <div>
          <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Total Users</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalUsers}</p>
        </div>
      </div>
      
      <div className="glass-panel p-6 flex items-center">
        <div className="p-3 bg-red-500/10 rounded-lg mr-4">
          <MicOff className="text-red-600 dark:text-red-400 w-6 h-6" />
        </div>
        <div>
          <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Muted Users</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{mutedUsers}</p>
        </div>
      </div>

      <div className="glass-panel p-6 flex items-center">
        <div className="p-3 bg-orange-500/10 rounded-lg mr-4">
          <ShieldAlert className="text-orange-600 dark:text-orange-400 w-6 h-6" />
        </div>
        <div>
          <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Total Warnings</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalWarns}</p>
        </div>
      </div>

      <div className="glass-panel p-4 col-span-1 md:col-span-3 h-64">
         <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">Weekly Activity (Current Week)</h3>
         <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyData}>
              <XAxis dataKey="name" axisLine={false} tickLine={false} stroke="#94a3b8" />
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: 'none', borderRadius: '8px', color: '#fff' }}
                cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }}
              />
              <Bar dataKey="warns" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
         </ResponsiveContainer>
      </div>
    </div>
  );
};
