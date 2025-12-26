import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { BarChart3, TrendingUp } from 'lucide-react';
import { statsApi } from '../api/stats';

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
                const [guildsData, activityData] = await Promise.all([
                    statsApi.getGuilds(),
                    statsApi.getActivity()
                ]);
                
                console.log("Analytics Data Received:", { guilds: guildsData, activity: activityData });

                if (Array.isArray(guildsData)) {
                    setGuildStats(guildsData);
                }
                
                if (Array.isArray(activityData)) {
                    setActivityStats(activityData);
                }
            } catch (error) {
                console.error('Failed to fetch analytics', error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    if (loading) return <div className="p-4 text-gray-500 dark:text-gray-400">Loading analytics...</div>;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Top Servers Chart */}
            <div className="glass-panel p-6">
                <div className="flex items-center gap-2 mb-6">
                    <div className="p-2 bg-blue-50 dark:bg-blue-500/20 rounded-lg">
                        <BarChart3 className="text-blue-600 dark:text-blue-400" size={20} />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800 dark:text-white">Top User Communities</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Where your verified users come from</p>
                    </div>
                </div>

                <div className="h-[300px] w-full">
                    {guildStats.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={guildStats} layout="vertical" margin={{ left: 20, right: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(156, 163, 175, 0.2)" />
                                <XAxis type="number" hide />
                                <YAxis 
                                    dataKey="name" 
                                    type="category" 
                                    width={120} 
                                    tick={{fontSize: 11, fill: '#9CA3AF'}} 
                                    tickFormatter={(val) => val && typeof val === 'string' ? (val.length > 15 ? val.substring(0, 15) + '...' : val) : ''}
                                />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', backgroundColor: 'rgba(17, 24, 39, 0.9)', color: '#fff' }}
                                    cursor={{fill: 'rgba(243, 244, 246, 0.1)'}}
                                />
                                <Bar dataKey="count" fill="#4F46E5" radius={[0, 4, 4, 0]} barSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400">
                            <BarChart3 size={48} className="mb-2 opacity-20" />
                            <p>No server data available</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Activity Chart */}
            <div className="glass-panel p-6">
                <div className="flex items-center gap-2 mb-6">
                    <div className="p-2 bg-orange-50 dark:bg-orange-500/20 rounded-lg">
                        <TrendingUp className="text-orange-600 dark:text-orange-400" size={20} />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800 dark:text-white">Moderation Activity</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Warnings issued over time</p>
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
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(156, 163, 175, 0.2)" />
                                <XAxis 
                                    dataKey="day" 
                                    tick={{fontSize: 12, fill: '#9CA3AF'}} 
                                    tickFormatter={(val) => val && typeof val === 'string' ? val.substring(5) : ''} // Show MM-DD
                                />
                                <YAxis allowDecimals={false} stroke="#9CA3AF" />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', backgroundColor: 'rgba(17, 24, 39, 0.9)', color: '#fff' }}
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
