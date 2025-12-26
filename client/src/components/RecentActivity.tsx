import React, { useState, useEffect } from 'react';
import { Clock, Shield, UserCheck, AlertTriangle, Activity } from 'lucide-react';
import api from '../api/client';

interface LogEntry {
    id: number;
    type: string;
    title: string;
    description: string;
    color: string;
    fields: { name: string; value: string; inline?: boolean }[];
    image_url?: string;
    timestamp: string;
}

export const RecentActivity: React.FC = () => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLogs = async () => {
            try {
                const response = await api.get('/logs?limit=5');
                setLogs(response.data);
            } catch (error) {
                console.error('Failed to fetch recent activity', error);
            } finally {
                setLoading(false);
            }
        };
        fetchLogs();
        
        // Refresh every 30 seconds
        const interval = setInterval(fetchLogs, 30000);
        return () => clearInterval(interval);
    }, []);

    const getIcon = (type: string) => {
        switch (type) {
            case 'moderation': return <Shield className="text-red-500" size={18} />;
            case 'verify': return <UserCheck className="text-green-500" size={18} />;
            case 'system': return <Clock className="text-blue-500" size={18} />;
            default: return <AlertTriangle className="text-gray-500" size={18} />;
        }
    };

    if (loading) return <div className="animate-pulse h-48 bg-gray-800/10 dark:bg-white/5 rounded-lg"></div>;

    return (
        <div className="glass-panel overflow-hidden">
            <div className="p-4 border-b border-gray-100/50 dark:border-white/5 flex items-center justify-between">
                <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <Activity size={20} className="text-blue-600 dark:text-blue-400" />
                    Recent Activity
                </h3>
                <span className="text-xs text-gray-500 dark:text-gray-400">Live updates</span>
            </div>
            <div className="divide-y divide-gray-100/50 dark:divide-white/5">
                {logs.length === 0 ? (
                    <div className="p-6 text-center text-gray-500 dark:text-gray-400">No recent activity</div>
                ) : (
                    logs.map((log) => (
                        <div key={log.id} className="p-4 hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors">
                            <div className="flex items-start gap-3">
                                <div className="mt-1 p-1.5 bg-gray-100 dark:bg-white/10 rounded-full">
                                    {getIcon(log.type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{log.title}</p>
                                        <span className="text-xs text-gray-400 whitespace-nowrap ml-2">
                                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">{log.description}</p>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
