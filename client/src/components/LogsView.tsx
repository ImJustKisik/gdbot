import React, { useState, useEffect } from 'react';
import { Clock, Shield, UserCheck, AlertTriangle, List } from 'lucide-react';
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

export const LogsView: React.FC = () => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>('all');
    const [page, setPage] = useState(0);

    useEffect(() => {
        fetchLogs();
    }, [filter, page]);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const typeParam = filter !== 'all' ? `&type=${filter}` : '';
            const response = await api.get(`/logs?limit=50&offset=${page * 50}${typeParam}`);
            setLogs(response.data);
        } catch (error) {
            console.error('Failed to fetch logs', error);
        } finally {
            setLoading(false);
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'moderation': return <Shield className="text-red-500" size={20} />;
            case 'verify': return <UserCheck className="text-green-500" size={20} />;
            case 'system': return <Clock className="text-blue-500" size={20} />;
            default: return <AlertTriangle className="text-gray-500" size={20} />;
        }
    };

    const getBorderColor = (color: string) => {
        switch (color) {
            case 'Red': return 'border-l-red-500';
            case 'Green': return 'border-l-green-500';
            case 'Blue': return 'border-l-blue-500';
            case 'Orange': return 'border-l-orange-500';
            default: return 'border-l-gray-300';
        }
    };

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <List size={24} />
                    Audit Logs
                </h2>
                <div className="flex gap-2">
                    <select 
                        value={filter} 
                        onChange={(e) => { setFilter(e.target.value); setPage(0); }}
                        className="p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                        <option value="all">All Events</option>
                        <option value="moderation">Moderation</option>
                        <option value="verify">Verification</option>
                        <option value="system">System</option>
                    </select>
                    <button 
                        onClick={() => fetchLogs()} 
                        className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                        <Clock size={18} />
                    </button>
                </div>
            </div>

            <div className="space-y-4">
                {loading ? (
                    <div className="text-center py-10 text-gray-500">Loading logs...</div>
                ) : logs.length === 0 ? (
                    <div className="text-center py-10 text-gray-500 bg-white rounded-xl border border-gray-100">
                        No logs found for this filter.
                    </div>
                ) : (
                    logs.map(log => (
                        <div key={log.id} className={`bg-white p-4 rounded-lg shadow-sm border border-gray-100 border-l-4 ${getBorderColor(log.color)} hover:shadow-md transition-shadow`}>
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-3">
                                    {getIcon(log.type)}
                                    <h3 className="font-semibold text-gray-800">{log.title}</h3>
                                </div>
                                <span className="text-xs text-gray-400">
                                    {new Date(log.timestamp).toLocaleString()}
                                </span>
                            </div>
                            <p className="text-gray-600 text-sm mb-3 pl-8">{log.description}</p>
                            
                            {log.fields && log.fields.length > 0 && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-8 mb-3">
                                    {log.fields.map((field, idx) => (
                                        <div key={idx} className="bg-gray-50 p-2 rounded text-xs">
                                            <span className="font-bold text-gray-700">{field.name}:</span> {field.value}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {log.image_url && (
                                <div className="pl-8 mt-2">
                                    <img src={log.image_url} alt="Evidence" className="max-h-48 rounded-lg border border-gray-200" />
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            <div className="flex justify-center gap-4 mt-6">
                <button 
                    disabled={page === 0}
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    className="px-4 py-2 bg-white border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50"
                >
                    Previous
                </button>
                <span className="py-2 text-gray-500">Page {page + 1}</span>
                <button 
                    disabled={logs.length < 50}
                    onClick={() => setPage(p => p + 1)}
                    className="px-4 py-2 bg-white border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50"
                >
                    Next
                </button>
            </div>
        </div>
    );
};
