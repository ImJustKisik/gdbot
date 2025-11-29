import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Save, Plus, Trash2, AlertTriangle } from 'lucide-react';

interface Settings {
    logChannelId: string;
    verificationChannelId: string;
    roleUnverified: string;
    roleVerified: string;
}

interface Preset {
    id: number;
    name: string;
    points: number;
}

interface Escalation {
    id: number;
    threshold: number;
    action: 'mute' | 'kick' | 'ban';
    duration?: number;
}

export const SettingsView: React.FC = () => {
    const [settings, setSettings] = useState<Settings>({
        logChannelId: '',
        verificationChannelId: '',
        roleUnverified: '',
        roleVerified: ''
    });
    const [presets, setPresets] = useState<Preset[]>([]);
    const [escalations, setEscalations] = useState<Escalation[]>([]);
    
    const [newPresetName, setNewPresetName] = useState('');
    const [newPresetPoints, setNewPresetPoints] = useState(1);

    const [newRuleThreshold, setNewRuleThreshold] = useState(10);
    const [newRuleAction, setNewRuleAction] = useState<'mute' | 'kick' | 'ban'>('mute');
    const [newRuleDuration, setNewRuleDuration] = useState(60);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [settingsRes, presetsRes, escalationsRes] = await Promise.all([
                axios.get('/api/settings'),
                axios.get('/api/presets'),
                axios.get('/api/escalations')
            ]);
            setSettings(settingsRes.data);
            setPresets(presetsRes.data);
            setEscalations(escalationsRes.data);
        } catch (error) {
            console.error('Failed to fetch settings', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveSettings = async () => {
        setSaving(true);
        try {
            await axios.post('/api/settings', settings);
            alert('Settings saved!');
        } catch (error) {
            alert('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const handleAddPreset = async () => {
        if (!newPresetName) return;
        try {
            await axios.post('/api/presets', { name: newPresetName, points: newPresetPoints });
            setNewPresetName('');
            setNewPresetPoints(1);
            fetchData();
        } catch (error) {
            alert('Failed to add preset');
        }
    };

    const handleDeletePreset = async (id: number) => {
        try {
            await axios.delete(`/api/presets/${id}`);
            fetchData();
        } catch (error) {
            alert('Failed to delete preset');
        }
    };

    const handleAddEscalation = async () => {
        try {
            await axios.post('/api/escalations', { 
                threshold: newRuleThreshold, 
                action: newRuleAction, 
                duration: newRuleDuration 
            });
            fetchData();
        } catch (error) {
            alert('Failed to add rule');
        }
    };

    const handleDeleteEscalation = async (id: number) => {
        try {
            await axios.delete(`/api/escalations/${id}`);
            fetchData();
        } catch (error) {
            alert('Failed to delete rule');
        }
    };

    if (loading) return <div>Loading...</div>;

    return (
        <div className="space-y-8 max-w-4xl mx-auto">
            
            {/* General Settings */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-xl font-bold mb-6 text-gray-800">General Configuration</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Log Channel ID</label>
                        <input 
                            type="text" 
                            className="w-full p-2 border border-gray-300 rounded-lg"
                            value={settings.logChannelId}
                            onChange={e => setSettings({...settings, logChannelId: e.target.value})}
                            placeholder="Channel ID for logs"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Verification Channel ID</label>
                        <input 
                            type="text" 
                            className="w-full p-2 border border-gray-300 rounded-lg"
                            value={settings.verificationChannelId}
                            onChange={e => setSettings({...settings, verificationChannelId: e.target.value})}
                            placeholder="Channel ID for fallback messages"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Unverified Role Name</label>
                        <input 
                            type="text" 
                            className="w-full p-2 border border-gray-300 rounded-lg"
                            value={settings.roleUnverified}
                            onChange={e => setSettings({...settings, roleUnverified: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Verified Role Name</label>
                        <input 
                            type="text" 
                            className="w-full p-2 border border-gray-300 rounded-lg"
                            value={settings.roleVerified}
                            onChange={e => setSettings({...settings, roleVerified: e.target.value})}
                        />
                    </div>
                </div>
                <div className="mt-6 flex justify-end">
                    <button 
                        onClick={handleSaveSettings}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                        <Save size={18} />
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>

            {/* Escalation Rules (New) */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-2 mb-6">
                    <div className="p-2 bg-red-50 rounded-lg">
                        <AlertTriangle className="text-red-600" size={20} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">Automod Rules (Escalations)</h2>
                        <p className="text-sm text-gray-500">Automatically punish users when they reach point thresholds</p>
                    </div>
                </div>

                <div className="space-y-4 mb-6">
                    {escalations.map(rule => (
                        <div key={rule.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                            <div className="flex items-center gap-4">
                                <span className="font-bold text-gray-700 w-24">≥ {rule.threshold} pts</span>
                                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                                    rule.action === 'ban' ? 'bg-red-100 text-red-700' : 
                                    rule.action === 'kick' ? 'bg-orange-100 text-orange-700' : 
                                    'bg-yellow-100 text-yellow-700'
                                }`}>
                                    {rule.action.toUpperCase()}
                                </span>
                                {rule.action === 'mute' && (
                                    <span className="text-sm text-gray-500">for {rule.duration} mins</span>
                                )}
                            </div>
                            <button 
                                onClick={() => handleDeleteEscalation(rule.id)}
                                className="text-gray-400 hover:text-red-600 transition-colors"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ))}
                    {escalations.length === 0 && (
                        <p className="text-center text-gray-400 py-4">No rules defined. Users will only be warned.</p>
                    )}
                </div>

                <div className="flex flex-wrap gap-4 items-end bg-gray-50 p-4 rounded-lg border border-gray-200 border-dashed">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Threshold (Pts)</label>
                        <input 
                            type="number" 
                            className="w-24 p-2 border border-gray-300 rounded-lg"
                            value={newRuleThreshold}
                            onChange={e => setNewRuleThreshold(Number(e.target.value))}
                            min="1"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Action</label>
                        <select 
                            className="w-32 p-2 border border-gray-300 rounded-lg"
                            value={newRuleAction}
                            onChange={e => setNewRuleAction(e.target.value as any)}
                        >
                            <option value="mute">Mute</option>
                            <option value="kick">Kick</option>
                            <option value="ban">Ban</option>
                        </select>
                    </div>
                    {newRuleAction === 'mute' && (
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Duration (Min)</label>
                            <input 
                                type="number" 
                                className="w-24 p-2 border border-gray-300 rounded-lg"
                                value={newRuleDuration}
                                onChange={e => setNewRuleDuration(Number(e.target.value))}
                                min="1"
                            />
                        </div>
                    )}
                    <button 
                        onClick={handleAddEscalation}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 ml-auto"
                    >
                        <Plus size={18} />
                        Add Rule
                    </button>
                </div>
            </div>

            {/* Warning Presets */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-xl font-bold mb-6 text-gray-800">Warning Presets</h2>
                <div className="space-y-3 mb-6">
                    {presets.map(preset => (
                        <div key={preset.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                                <span className="font-medium text-gray-900">{preset.name}</span>
                                <span className="ml-2 text-sm text-gray-500">({preset.points} points)</span>
                            </div>
                            <button 
                                onClick={() => handleDeletePreset(preset.id)}
                                className="text-gray-400 hover:text-red-600"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ))}
                </div>
                <div className="flex gap-3">
                    <input 
                        type="text" 
                        placeholder="Reason (e.g. Spam)"
                        className="flex-1 p-2 border border-gray-300 rounded-lg"
                        value={newPresetName}
                        onChange={e => setNewPresetName(e.target.value)}
                    />
                    <input 
                        type="number" 
                        placeholder="Pts"
                        className="w-20 p-2 border border-gray-300 rounded-lg"
                        value={newPresetPoints}
                        onChange={e => setNewPresetPoints(Number(e.target.value))}
                        min="1"
                        max="20"
                    />
                    <button 
                        onClick={handleAddPreset}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                        <Plus size={18} />
                        Add
                    </button>
                </div>
            </div>
        </div>
    );
};