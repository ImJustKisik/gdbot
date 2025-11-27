import React from 'react';
import { Users, ShieldAlert, MicOff } from 'lucide-react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { User } from '../types';

interface Props {
  users: User[];
}

export const DashboardStats: React.FC<Props> = ({ users }) => {
  const totalUsers = users.length;
  const mutedUsers = users.filter(u => u.status === 'Muted').length;
  const totalWarns = users.reduce((acc, u) => acc + u.warnings.length, 0);

  const data = [
    { name: 'Mon', warns: 2 },
    { name: 'Tue', warns: 5 },
    { name: 'Wed', warns: 3 },
    { name: 'Thu', warns: 8 },
    { name: 'Fri', warns: 4 },
    { name: 'Sat', warns: 1 },
    { name: 'Sun', warns: Math.max(1, totalWarns % 10) },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center">
        <div className="p-3 bg-blue-50 rounded-lg mr-4">
          <Users className="text-blue-600 w-6 h-6" />
        </div>
        <div>
          <p className="text-gray-500 text-sm font-medium">Total Users</p>
          <p className="text-2xl font-bold text-gray-900">{totalUsers}</p>
        </div>
      </div>
      
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center">
        <div className="p-3 bg-red-50 rounded-lg mr-4">
          <MicOff className="text-red-600 w-6 h-6" />
        </div>
        <div>
          <p className="text-gray-500 text-sm font-medium">Muted Users</p>
          <p className="text-2xl font-bold text-gray-900">{mutedUsers}</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center">
        <div className="p-3 bg-orange-50 rounded-lg mr-4">
          <ShieldAlert className="text-orange-600 w-6 h-6" />
        </div>
        <div>
          <p className="text-gray-500 text-sm font-medium">Total Warnings</p>
          <p className="text-2xl font-bold text-gray-900">{totalWarns}</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 col-span-1 md:col-span-3 h-64">
         <h3 className="text-lg font-semibold mb-4 text-gray-800">Weekly Activity</h3>
         <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <XAxis dataKey="name" axisLine={false} tickLine={false} />
              <Tooltip cursor={{fill: '#f3f4f6'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
              <Bar dataKey="warns" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
         </ResponsiveContainer>
      </div>
    </div>
  );
};
