import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Save, AlertCircle, Plus, Trash2 } from 'lucide-react';

interface Settings {
  logChannelId: string;
  verificationChannelId: string;
  autoMuteThreshold: number;
  autoMuteDuration: number;
  roleUnverified: string;
  roleVerified: string;
}

interface Role {
  id: string;
  name: string;
}

interface Preset {
  id: number;
  name: string;
  points: number;
}

export const SettingsView: React.FC = () => {
  const [settings, setSettings] = useState<Settings>({
    logChannelId: '',
    verificationChannelId: '',
    autoMuteThreshold: 20,
    autoMuteDuration: 60,
    roleUnverified: 'Unverified',
    roleVerified: 'Verified'
  });
  const [roles, setRoles] = useState<Role[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [newPreset, setNewPreset] = useState({ name: '', points: 1 });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [settingsRes, rolesRes, presetsRes] = await Promise.all([
        axios.get('/api/settings'),
        axios.get('/api/roles'),
        axios.get('/api/presets')
      ]);
      setSettings(settingsRes.data);
      setRoles(rolesRes.data);
      setPresets(presetsRes.data);
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Failed to load data' });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: name.includes('Threshold') || name.includes('Duration') ? parseInt(value) || 0 : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await axios.post('/api/settings', settings);
      setMessage({ type: 'success', text: 'Settings saved successfully' });
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddPreset = async () => {
    if (!newPreset.name) return;
    try {
      await axios.post('/api/presets', newPreset);
      setNewPreset({ name: '', points: 1 });
      const res = await axios.get('/api/presets');
      setPresets(res.data);
    } catch (err) {
      alert('Failed to add preset');
    }
  };

  const handleDeletePreset = async (id: number) => {
    if (!confirm('Delete this preset?')) return;
    try {
      await axios.delete(`/api/presets/${id}`);
      setPresets(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      alert('Failed to delete preset');
    }
  };

  if (loading) return <div className="p-8 text-center">Loading settings...</div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-800">Bot Settings</h2>
        <p className="text-gray-500">Configure channels, roles, and automation rules</p>
      </div>

      {message && (
        <div className={`p-4 mb-6 rounded-lg flex items-center gap-2 ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          <AlertCircle size={20} />
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Channels */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">Channels (IDs)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Log Channel ID</label>
              <input
                type="text"
                name="logChannelId"
                value={settings.logChannelId}
                onChange={handleChange}
                placeholder="e.g. 123456789012345678"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Channel where audit logs will be posted.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Verification Channel ID</label>
              <input
                type="text"
                name="verificationChannelId"
                value={settings.verificationChannelId}
                onChange={handleChange}
                placeholder="e.g. 123456789012345678"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Fallback channel if DM fails.</p>
            </div>
          </div>
        </div>

        {/* Roles */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">Roles</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unverified Role</label>
              <select
                name="roleUnverified"
                value={settings.roleUnverified}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select a role...</option>
                {roles.map(role => (
                  <option key={role.id} value={role.name}>{role.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Verified Role</label>
              <select
                name="roleVerified"
                value={settings.roleVerified}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select a role...</option>
                {roles.map(role => (
                  <option key={role.id} value={role.name}>{role.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Automation */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">Automation Rules</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Auto-Mute Threshold (Points)</label>
              <input
                type="number"
                name="autoMuteThreshold"
                value={settings.autoMuteThreshold}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Points required to trigger auto-mute.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Auto-Mute Duration (Minutes)</label>
              <input
                type="number"
                name="autoMuteDuration"
                value={settings.autoMuteDuration}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Presets */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">Warning Presets</h3>
          
          <div className="flex gap-4 mb-6">
            <input 
              type="text" 
              placeholder="Reason (e.g. Spam)" 
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg"
              value={newPreset.name}
              onChange={e => setNewPreset({...newPreset, name: e.target.value})}
            />
            <input 
              type="number" 
              placeholder="Points" 
              className="w-24 px-4 py-2 border border-gray-300 rounded-lg"
              value={newPreset.points}
              onChange={e => setNewPreset({...newPreset, points: parseInt(e.target.value) || 1})}
              min="1"
              max="20"
            />
            <button 
              type="button"
              onClick={handleAddPreset}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <Plus size={20} /> Add
            </button>
          </div>

          <div className="space-y-2">
            {presets.map(preset => (
              <div key={preset.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div>
                  <span className="font-medium text-gray-900">{preset.name}</span>
                  <span className="ml-2 text-sm text-gray-500">{preset.points} points</span>
                </div>
                <button 
                  type="button"
                  onClick={() => handleDeletePreset(preset.id)}
                  className="text-red-500 hover:text-red-700 p-1"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
            {presets.length === 0 && <p className="text-gray-500 text-sm text-center">No presets added yet.</p>}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
          >
            <Save size={20} />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
};
