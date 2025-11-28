import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { BarChart3, TrendingUp } from 'lucide-react';

interface GuildStat {
    id: string;
    name: string;
    icon: string;
    count: number;
}

interface ActivityStat {
    day: string;
    count: number;
}

export const AnalyticsView: React.FC = () => {
    const [guildStats, setGuildStats] = useState<GuildStat[]>([]);
    const [activityStats, setActivityStats] = useState<ActivityStat[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [guildsRes, activityRes] = await Promise.all([
                    axios.get('/api/stats/guilds'),
                    axios.get('/api/stats/activity')
                ]);
                setGuildStats(guildsRes.data);
                setActivityStats(activityRes.data);
            } catch (error) {
                console.error('Failed to fetch analytics', error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    if (loading) return <div className="p-4 text-gray-500">Loading analytics...</div>;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Top Servers Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-2 mb-6">
                    <div className="p-2 bg-blue-50 rounded-lg">
                        <BarChart3 className="text-blue-600" size={20} />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800">Top User Communities</h3>
                        <p className="text-sm text-gray-500">Where your verified users come from</p>
                    </div>
                </div>

                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={guildStats} layout="vertical" margin={{ left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                            <XAxis type="number" hide />
                            <YAxis 
                                dataKey="name" 
                                type="category" 
                                width={100} 
                                tick={{fontSize: 12}} 
                                tickFormatter={(val) => val.length > 12 ? val.substring(0, 12) + '...' : val}
                            />
                            <Tooltip 
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                cursor={{fill: '#f3f4f6'}}
                            />
                            <Bar dataKey="count" fill="#4F46E5" radius={[0, 4, 4, 0]} barSize={20} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Activity Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-2 mb-6">
                    <div className="p-2 bg-orange-50 rounded-lg">
                        <TrendingUp className="text-orange-600" size={20} />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800">Moderation Activity</h3>
                        <p className="text-sm text-gray-500">Warnings issued over time</p>
                    </div>
                </div>

                <div className="h-[300px] w-full">
                    {activityStats.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={activityStats}>
                                <defs>
                                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#F97316" stopOpacity={0.1}/>
                                        <stop offset="95%" stopColor="#F97316" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis 
                                    dataKey="day" 
                                    tick={{fontSize: 12}} 
                                    tickFormatter={(val) => val.substring(5)} // Show MM-DD
                                />
                                <YAxis allowDecimals={false} />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Area type="monotone" dataKey="count" stroke="#F97316" fillOpacity={1} fill="url(#colorCount)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex items-center justify-center text-gray-400">
                            No activity recorded yet
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
