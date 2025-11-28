import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Save, AlertCircle } from 'lucide-react';

interface Settings {
  logChannelId: string;
  verificationChannelId: string;
  autoMuteThreshold: number;
  autoMuteDuration: number;
  roleUnverified: string;
  roleVerified: string;
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await axios.get('/api/settings');
      setSettings(res.data);
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
          <h3 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">Roles (Names)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unverified Role Name</label>
              <input
                type="text"
                name="roleUnverified"
                value={settings.roleUnverified}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Verified Role Name</label>
              <input
                type="text"
                name="roleVerified"
                value={settings.roleVerified}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
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
