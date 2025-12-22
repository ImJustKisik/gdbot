import React, { useState, useEffect } from 'react';
import { Save, Plus, Trash2, AlertTriangle, Settings as SettingsIcon, Shield, List, Brain } from 'lucide-react';
import { settingsApi, Settings, Preset, Escalation, SelectOption } from '../api/settings';

const INITIAL_SETTINGS: Settings = {
    logChannelId: '',
    modLogChannelId: '',
    verificationChannelId: '',
    roleUnverified: '',
    roleVerified: '',
    autoMuteThreshold: 20,
    autoMuteDuration: 60,
    aiEnabled: true,
    aiThreshold: 60,
    aiAction: 'log',
    aiPrompt: '',
    aiBatchPrompt: '', // New field
    aiRules: '',
    appealsEnabled: true,
    appealsPrompt: '', // New field
    appealsChannelId: '',
    ticketsCategoryId: ''
};

export const SettingsView: React.FC = () => {
    const [settings, setSettings] = useState<Settings>({ ...INITIAL_SETTINGS });
    const [presets, setPresets] = useState<Preset[]>([]);
    const [escalations, setEscalations] = useState<Escalation[]>([]);
    const [channels, setChannels] = useState<SelectOption[]>([]);
    const [roles, setRoles] = useState<SelectOption[]>([]);
    
    const [activeTab, setActiveTab] = useState<'general' | 'automod' | 'presets' | 'ai' | 'appeals'>('general');

    const [newPresetName, setNewPresetName] = useState('');
    const [newPresetPoints, setNewPresetPoints] = useState(1);

    const [newRuleName, setNewRuleName] = useState('');
    const [newRuleThreshold, setNewRuleThreshold] = useState(10);
    const [newRuleAction, setNewRuleAction] = useState<'mute' | 'kick' | 'ban'>('mute');
    const [newRuleDuration, setNewRuleDuration] = useState(60);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoadError(null);
            const data = await settingsApi.getBundle();
            const bundleSettings = data.settings || { ...INITIAL_SETTINGS };
            setSettings({
                ...INITIAL_SETTINGS,
                ...bundleSettings,
                autoMuteThreshold: Number(bundleSettings.autoMuteThreshold ?? INITIAL_SETTINGS.autoMuteThreshold),
                autoMuteDuration: Number(bundleSettings.autoMuteDuration ?? INITIAL_SETTINGS.autoMuteDuration),
                aiEnabled: bundleSettings.aiEnabled !== undefined ? bundleSettings.aiEnabled : true,
                aiThreshold: Number(bundleSettings.aiThreshold ?? 60),
                aiAction: bundleSettings.aiAction || 'log',
                aiPrompt: bundleSettings.aiPrompt || '',
                aiBatchPrompt: bundleSettings.aiBatchPrompt || '', // New field
                aiRules: bundleSettings.aiRules || '',
                appealsEnabled: bundleSettings.appealsEnabled !== undefined ? bundleSettings.appealsEnabled : true,
                appealsPrompt: bundleSettings.appealsPrompt || '', // New field
                appealsChannelId: bundleSettings.appealsChannelId || '',
                ticketsCategoryId: bundleSettings.ticketsCategoryId || ''
            });
            setPresets(Array.isArray(data.presets) ? data.presets : []);
            setEscalations(Array.isArray(data.escalations) ? data.escalations : []);
            setRoles(Array.isArray(data.roles) ? data.roles : []);
            setChannels(Array.isArray(data.channels) ? data.channels : []);
        } catch (error) {
            console.error('Failed to fetch settings bundle', error);
            setLoadError('Не удалось загрузить настройки. Проверьте соединение с ботом и повторите попытку.');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveSettings = async () => {
        setSaving(true);
        setFeedback(null);
        try {
            const payload = {
                ...settings,
                autoMuteThreshold: Number(settings.autoMuteThreshold) || 0,
                autoMuteDuration: Math.max(1, Number(settings.autoMuteDuration) || INITIAL_SETTINGS.autoMuteDuration),
                aiThreshold: Number(settings.aiThreshold) || 60,
                appealsEnabled: Boolean(settings.appealsEnabled)
            };
            await settingsApi.updateSettings(payload);
            setFeedback({ type: 'success', message: 'Настройки сохранены.' });
            setTimeout(() => setFeedback(null), 3000);
        } catch (error: any) {
            const msg = error.response?.data?.error || error.message || 'Не удалось сохранить настройки';
            setFeedback({ type: 'error', message: msg });
        } finally {
            setSaving(false);
        }
    };

    const handleAddPreset = async () => {
        if (!newPresetName.trim()) return;
        try {
            await settingsApi.createPreset(newPresetName, newPresetPoints);
            setNewPresetName('');
            setNewPresetPoints(1);
            await fetchData();
        } catch (error) {
            alert('Failed to add preset');
        }
    };

    const handleDeletePreset = async (id: number) => {
        if (!confirm('Удалить этот пресет предупреждения?')) return;
        try {
            await settingsApi.deletePreset(id);
            await fetchData();
        } catch (error) {
            alert('Failed to delete preset');
        }
    };

    const handleAddEscalation = async () => {
        try {
            await settingsApi.createEscalation({ 
                name: newRuleName || `Rule ${escalations.length + 1}`,
                threshold: newRuleThreshold, 
                action: newRuleAction, 
                duration: newRuleAction === 'mute' ? newRuleDuration : undefined 
            });
            setNewRuleName('');
            await fetchData();
        } catch (error: any) {
            const msg = error.response?.data?.error || error.message || 'Failed to add rule';
            alert(msg);
        }
    };

    const handleDeleteEscalation = async (id: number) => {
        if (!confirm('Удалить это правило автомодерации?')) return;
        try {
            await settingsApi.deleteEscalation(id);
            await fetchData();
        } catch (error) {
            alert('Failed to delete rule');
        }
    };

    const getChannelDisplay = (id?: string) => {
        if (!id) return 'Не выбрано';
        const channel = channels.find(ch => ch.value === id);
        return channel ? `#${channel.label}` : 'Неизвестный канал';
    };

    const getRoleDisplay = (id?: string) => {
        if (!id) return 'Не выбрано';
        const role = roles.find(r => r.value === id);
        return role ? role.label : 'Неизвестная роль';
    };

    if (loading) {
        return (
            <div className="space-y-4">
                {[0, 1, 2].map(index => (
                    <div key={index} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 animate-pulse">
                        <div className="h-4 bg-gray-200 rounded w-1/3 mb-6" />
                        <div className="space-y-3">
                            <div className="h-3 bg-gray-100 rounded" />
                            <div className="h-3 bg-gray-100 rounded w-5/6" />
                            <div className="h-3 bg-gray-100 rounded w-2/3" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            {feedback && (
                <div className={`p-3 rounded-lg ${feedback.type === 'error' ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-green-50 text-green-700 border border-green-100'} transition-all`}>
                    {feedback.message}
                </div>
            )}
            {loadError && (
                <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <span>{loadError}</span>
                    <button
                        onClick={() => { setLoading(true); fetchData(); }}
                        className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                    >
                        Повторить
                    </button>
                </div>
            )}

            {/* Tabs Navigation */}
            <div className="flex space-x-1 bg-white p-1 rounded-xl shadow-sm border border-gray-100">
                <button
                    onClick={() => setActiveTab('general')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${
                        activeTab === 'general' 
                            ? 'bg-blue-50 text-blue-600 shadow-sm' 
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                >
                    <SettingsIcon size={18} />
                    General
                </button>
                <button
                    onClick={() => setActiveTab('automod')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${
                        activeTab === 'automod' 
                            ? 'bg-blue-50 text-blue-600 shadow-sm' 
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                >
                    <Shield size={18} />
                    Automod
                </button>
                <button
                    onClick={() => setActiveTab('presets')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${
                        activeTab === 'presets' 
                            ? 'bg-blue-50 text-blue-600 shadow-sm' 
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                >
                    <List size={18} />
                    Presets
                </button>
                <button
                    onClick={() => setActiveTab('ai')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${
                        activeTab === 'ai' 
                            ? 'bg-blue-50 text-blue-600 shadow-sm' 
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                >
                    <Brain size={18} />
                    AI Moderation
                </button>
                <button
                    onClick={() => setActiveTab('appeals')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${
                        activeTab === 'appeals' 
                            ? 'bg-blue-50 text-blue-600 shadow-sm' 
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                >
                    <List size={18} />
                    Appeals
                </button>
            </div>
            
            {/* General Settings */}
            {activeTab === 'general' && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <h2 className="text-xl font-bold mb-6 text-gray-800">General Configuration</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Log Channel</label>
                            <select 
                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                value={settings.logChannelId || ''}
                                onChange={e => setSettings({...settings, logChannelId: e.target.value})}
                            >
                                <option value="">Не выбрано</option>
                                {channels.map(channel => (
                                    <option key={channel.value} value={channel.value}>#{channel.label}</option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500 mt-1">Current: {getChannelDisplay(settings.logChannelId)}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Mod Log Channel</label>
                            <select 
                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                value={settings.modLogChannelId || ''}
                                onChange={e => setSettings({...settings, modLogChannelId: e.target.value})}
                            >
                                <option value="">Не выбрано</option>
                                {channels.map(channel => (
                                    <option key={`${channel.value}-mod`} value={channel.value}>#{channel.label}</option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500 mt-1">Current: {getChannelDisplay(settings.modLogChannelId)}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Verification Channel</label>
                            <select 
                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                value={settings.verificationChannelId || ''}
                                onChange={e => setSettings({...settings, verificationChannelId: e.target.value})}
                            >
                                <option value="">Не выбрано</option>
                                {channels.map(channel => (
                                    <option key={`${channel.value}-verify`} value={channel.value}>#{channel.label}</option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500 mt-1">Current: {getChannelDisplay(settings.verificationChannelId)}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Unverified Role</label>
                            <select 
                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                value={settings.roleUnverified || ''}
                                onChange={e => setSettings({...settings, roleUnverified: e.target.value})}
                            >
                                <option value="">Не выбрано</option>
                                {roles.map(role => (
                                    <option key={`${role.value}-unverified`} value={role.value}>{role.label}</option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500 mt-1">Current: {getRoleDisplay(settings.roleUnverified)}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Verified Role</label>
                            <select 
                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                value={settings.roleVerified || ''}
                                onChange={e => setSettings({...settings, roleVerified: e.target.value})}
                            >
                                <option value="">Не выбрано</option>
                                {roles.map(role => (
                                    <option key={`${role.value}-verified`} value={role.value}>{role.label}</option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500 mt-1">Current: {getRoleDisplay(settings.roleVerified)}</p>
                        </div>
                    </div>
                    <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end">
                        <button 
                            onClick={handleSaveSettings}
                            disabled={saving}
                            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium shadow-sm"
                        >
                            <Save size={18} />
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </div>
            )}

            {/* Automod Settings */}
            {activeTab === 'automod' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    {/* Default Auto-Mute Settings */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h2 className="text-xl font-bold mb-2 text-gray-800">Default Auto-Mute</h2>
                        <p className="text-sm text-gray-500 mb-6">Fallback rules when no specific escalation matches. Set threshold to 0 to disable.</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Threshold (Points)</label>
                                <input 
                                    type="number"
                                    min={0}
                                    max={200}
                                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                    value={settings.autoMuteThreshold}
                                    onChange={e => setSettings(prev => ({ ...prev, autoMuteThreshold: Math.max(0, Number(e.target.value)) }))}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Duration (Minutes)</label>
                                <input 
                                    type="number"
                                    min={1}
                                    max={10080}
                                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                    value={settings.autoMuteDuration}
                                    onChange={e => setSettings(prev => ({ ...prev, autoMuteDuration: Math.max(1, Number(e.target.value)) }))}
                                />
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end">
                            <button 
                                onClick={handleSaveSettings}
                                disabled={saving}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium"
                            >
                                <Save size={16} />
                                Save Defaults
                            </button>
                        </div>
                    </div>

                    {/* Escalation Rules */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-orange-50 rounded-lg text-orange-600">
                                <AlertTriangle size={20} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-gray-800">Escalation Rules</h2>
                                <p className="text-sm text-gray-500">Specific punishments for point thresholds.</p>
                            </div>
                        </div>

                        <div className="space-y-3 mb-6">
                            {Array.isArray(escalations) && escalations.map(rule => (
                                <div key={rule.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-gray-800">{rule.name || 'Rule'}</span>
                                            <span className="text-sm text-gray-500">≥ {rule.threshold} pts</span>
                                        </div>
                                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
                                            rule.action === 'ban' ? 'bg-red-100 text-red-700' : 
                                            rule.action === 'kick' ? 'bg-orange-100 text-orange-700' : 
                                            'bg-yellow-100 text-yellow-700'
                                        }`}>
                                            {rule.action}
                                        </span>
                                        {rule.action === 'mute' && (
                                            <span className="text-sm text-gray-500 font-medium">{rule.duration}m</span>
                                        )}
                                    </div>
                                    <button 
                                        onClick={() => handleDeleteEscalation(rule.id)}
                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))}
                            {escalations.length === 0 && (
                                <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                    <p className="text-gray-400">No custom rules defined.</p>
                                </div>
                            )}
                        </div>

                        <div className="bg-gray-50 p-5 rounded-xl border border-gray-200">
                            <h3 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">Add New Rule</h3>
                            <div className="flex flex-wrap gap-4 items-end">
                                <div className="flex-1 min-w-[150px]">
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                                    <input 
                                        type="text" 
                                        className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                                        value={newRuleName}
                                        onChange={e => setNewRuleName(e.target.value)}
                                        placeholder="e.g. Mute 1h"
                                    />
                                </div>
                                <div className="w-24">
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Threshold</label>
                                    <input 
                                        type="number" 
                                        className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                                        value={newRuleThreshold}
                                        onChange={e => setNewRuleThreshold(Number(e.target.value))}
                                        min="1"
                                    />
                                </div>
                                <div className="w-32">
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Action</label>
                                    <select 
                                        className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                                        value={newRuleAction}
                                        onChange={e => setNewRuleAction(e.target.value as any)}
                                    >
                                        <option value="mute">Mute</option>
                                        <option value="kick">Kick</option>
                                        <option value="ban">Ban</option>
                                    </select>
                                </div>
                                {newRuleAction === 'mute' && (
                                    <div className="w-24">
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Duration (m)</label>
                                        <input 
                                            type="number" 
                                            className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                                            value={newRuleDuration}
                                            onChange={e => setNewRuleDuration(Number(e.target.value))}
                                            min="1"
                                        />
                                    </div>
                                )}
                                <button 
                                    onClick={handleAddEscalation}
                                    className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-black transition-colors text-sm font-medium ml-auto"
                                >
                                    <Plus size={16} />
                                    Add Rule
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Warning Presets */}
            {activeTab === 'presets' && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <h2 className="text-xl font-bold mb-6 text-gray-800">Warning Presets</h2>
                    <div className="space-y-3 mb-6">
                        {Array.isArray(presets) && presets.map(preset => (
                            <div key={preset.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                                <div>
                                    <span className="font-medium text-gray-900">{preset.name}</span>
                                    <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                        {preset.points} pts
                                    </span>
                                </div>
                                <button 
                                    onClick={() => handleDeletePreset(preset.id)}
                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        ))}
                        {presets.length === 0 && (
                            <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                <p className="text-gray-400">No presets defined.</p>
                            </div>
                        )}
                    </div>
                    
                    <div className="bg-gray-50 p-5 rounded-xl border border-gray-200">
                        <h3 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">Add New Preset</h3>
                        <div className="flex gap-3">
                            <input 
                                type="text" 
                                placeholder="Reason (e.g. Spamming)"
                                className="flex-1 p-2 border border-gray-300 rounded-lg text-sm"
                                value={newPresetName}
                                onChange={e => setNewPresetName(e.target.value)}
                            />
                            <input 
                                type="number" 
                                placeholder="Pts"
                                className="w-24 p-2 border border-gray-300 rounded-lg text-sm"
                                value={newPresetPoints}
                                onChange={e => setNewPresetPoints(Number(e.target.value))}
                                min="1"
                                max="20"
                            />
                            <button 
                                onClick={handleAddPreset}
                                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                            >
                                <Plus size={16} />
                                Add
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Settings */}
            {activeTab === 'ai' && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <h2 className="text-xl font-bold mb-6 text-gray-800">AI Moderation Configuration</h2>
                    
                    <div className="space-y-6">
                        <div className="flex items-center justify-between p-4 bg-gray-700 rounded-lg">
                            <div>
                                <label className="text-white font-medium">Включить AI анализ</label>
                                <p className="text-sm text-gray-400">Автоматически проверять сообщения на токсичность</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    className="sr-only peer"
                                    checked={settings.aiEnabled}
                                    onChange={(e) => setSettings({...settings, aiEnabled: e.target.checked})}
                                />
                                <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                            <div>
                                <label className="text-gray-800 font-medium">Пинговать нарушителя</label>
                                <p className="text-sm text-gray-500">Упоминать пользователя при выдаче предупреждения</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    className="sr-only peer"
                                    checked={settings.aiPingUser !== false} // Default true
                                    onChange={(e) => setSettings({...settings, aiPingUser: e.target.checked})}
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Single Message Prompt (Images/Direct)</label>
                            <p className="text-xs text-gray-500 mb-2">Instructions for analyzing single messages or images. Must return simple JSON.</p>
                            <textarea 
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm h-48"
                                value={settings.aiPrompt}
                                onChange={e => setSettings({...settings, aiPrompt: e.target.value})}
                                placeholder="Enter prompt for single messages..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Batch Analysis Prompt (Text Monitoring)</label>
                            <p className="text-xs text-gray-500 mb-2">Instructions for analyzing a list of messages. Must return <code>{`{ "results": [...] }`}</code> JSON.</p>
                            <textarea 
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm h-48"
                                value={settings.aiBatchPrompt}
                                onChange={e => setSettings({...settings, aiBatchPrompt: e.target.value})}
                                placeholder="Enter prompt for batch analysis..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Server Rules</label>
                            <p className="text-xs text-gray-500 mb-2">These rules will be injected into the prompt.</p>
                            <textarea 
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm h-48"
                                value={settings.aiRules}
                                onChange={e => setSettings({...settings, aiRules: e.target.value})}
                                placeholder="Enter server rules..."
                            />
                        </div>

                        <div className="flex justify-end pt-4 border-t border-gray-100">
                            <button 
                                onClick={handleSaveSettings}
                                disabled={saving}
                                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium shadow-sm"
                            >
                                <Save size={18} />
                                {saving ? 'Saving...' : 'Save AI Settings'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Appeals Settings */}
            {activeTab === 'appeals' && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <h2 className="text-xl font-bold mb-6 text-gray-800">Appeals Configuration</h2>
                    
                    <div className="space-y-6">
                        <div className="flex items-center justify-between p-4 bg-gray-700 rounded-lg">
                            <div>
                                <label className="text-white font-medium">Включить систему апелляций</label>
                                <p className="text-sm text-gray-400">Разрешить пользователям подавать апелляции через AI</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    className="sr-only peer"
                                    checked={settings.appealsEnabled}
                                    onChange={(e) => setSettings({...settings, appealsEnabled: e.target.checked})}
                                />
                                <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Канал для апелляций</label>
                                <select 
                                    className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:border-blue-500"
                                    value={settings.appealsChannelId}
                                    onChange={(e) => setSettings({...settings, appealsChannelId: e.target.value})}
                                >
                                    <option value="">Выберите канал...</option>
                                    {channels.map(c => (
                                        <option key={c.value} value={c.value}>{c.label}</option>
                                    ))}
                                </select>
                                <p className="text-xs text-gray-500 mt-1">Куда бот будет отправлять новые апелляции</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Категория тикетов</label>
                                <select
                                    value={settings.ticketsCategoryId}
                                    onChange={(e) => setSettings({ ...settings, ticketsCategoryId: e.target.value })}
                                    className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:border-blue-500"
                                >
                                    <option value="">Выберите категорию...</option>
                                    {channels.filter(c => c.label.startsWith('[Category]')).map(c => (
                                        <option key={c.value} value={c.value}>{c.label.replace('[Category] ', '')}</option>
                                    ))}
                                </select>
                                <p className="text-xs text-gray-500 mt-1">Где создавать каналы для рассмотрения</p>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Appeals Filter Prompt</label>
                            <p className="text-xs text-gray-500 mb-2">Instructions for validating appeals. Must return <code>{`{ "valid": boolean, "reason": "string" }`}</code> JSON.</p>
                            <textarea 
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm h-48"
                                value={settings.appealsPrompt}
                                onChange={e => setSettings({...settings, appealsPrompt: e.target.value})}
                                placeholder="Enter appeals filter prompt..."
                            />
                        </div>

                        <div className="flex justify-end pt-4 border-t border-gray-100">
                            <button 
                                onClick={handleSaveSettings}
                                disabled={saving}
                                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium shadow-sm"
                            >
                                <Save size={18} />
                                {saving ? 'Saving...' : 'Save Appeals Settings'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};