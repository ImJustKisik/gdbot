import React, { useState, useEffect } from 'react';
import api from '../api/client';

interface EmbedField {
    name: string;
    value: string;
    inline: boolean;
}

interface EmbedData {
    title: string;
    description: string;
    color: string;
    url?: string;
    image?: string;
    thumbnail?: string;
    footer?: { text: string; icon_url?: string };
    author?: { name: string; icon_url?: string; url?: string };
    fields: EmbedField[];
}

interface Channel {
    value: string;
    label: string;
}

const EmbedBuilder: React.FC = () => {
    const [channels, setChannels] = useState<Channel[]>([]);
    const [selectedChannel, setSelectedChannel] = useState<string>('');
    const [messageContent, setMessageContent] = useState<string>('');
    const [embed, setEmbed] = useState<EmbedData>({
        title: '',
        description: '',
        color: '#0099ff',
        fields: []
    });
    
    // Edit Mode State
    const [editMode, setEditMode] = useState(false);
    const [editMessageId, setEditMessageId] = useState('');
    const [editChannelId, setEditChannelId] = useState('');
    const [statusMsg, setStatusMsg] = useState<{type: 'success'|'error', text: string} | null>(null);

    useEffect(() => {
        fetchChannels();
    }, []);

    const fetchChannels = async () => {
        try {
            const res = await api.get('/channels');
            setChannels(res.data);
            if (res.data.length > 0) setSelectedChannel(res.data[0].value);
        } catch (err) {
            console.error('Failed to fetch channels', err);
        }
    };

    const handleFieldChange = (index: number, field: keyof EmbedField, value: any) => {
        const newFields = [...embed.fields];
        newFields[index] = { ...newFields[index], [field]: value };
        setEmbed({ ...embed, fields: newFields });
    };

    const addField = () => {
        setEmbed({ ...embed, fields: [...embed.fields, { name: 'New Field', value: 'Value', inline: false }] });
    };

    const removeField = (index: number) => {
        const newFields = embed.fields.filter((_, i) => i !== index);
        setEmbed({ ...embed, fields: newFields });
    };

    const handleSend = async () => {
        try {
            setStatusMsg(null);
            if (editMode) {
                await api.post('/embeds/edit', {
                    channelId: editChannelId,
                    messageId: editMessageId,
                    content: messageContent,
                    embed
                });
                setStatusMsg({ type: 'success', text: 'Message updated successfully!' });
            } else {
                await api.post('/embeds/send', {
                    channelId: selectedChannel,
                    content: messageContent,
                    embed
                });
                setStatusMsg({ type: 'success', text: 'Message sent successfully!' });
            }
        } catch (err: any) {
            console.error(err);
            setStatusMsg({ type: 'error', text: err.response?.data?.error || 'Failed to send message' });
        }
    };

    const loadMessage = async () => {
        if (!editChannelId || !editMessageId) return;
        try {
            setStatusMsg(null);
            const res = await api.get(`/embeds/fetch?channelId=${editChannelId}&messageId=${editMessageId}`);
            const msg = res.data;
            
            setMessageContent(msg.content || '');
            if (msg.embeds && msg.embeds.length > 0) {
                const e = msg.embeds[0];
                setEmbed({
                    title: e.title || '',
                    description: e.description || '',
                    color: e.hexColor || '#0099ff',
                    url: e.url,
                    image: e.image?.url,
                    thumbnail: e.thumbnail?.url,
                    footer: e.footer ? { text: e.footer.text, icon_url: e.footer.iconURL } : undefined,
                    author: e.author ? { name: e.author.name, icon_url: e.author.iconURL, url: e.author.url } : undefined,
                    fields: e.fields ? e.fields.map((f: any) => ({ name: f.name, value: f.value, inline: f.inline })) : []
                });
            }
            setEditMode(true);
            setStatusMsg({ type: 'success', text: 'Message loaded!' });
        } catch (err: any) {
            setStatusMsg({ type: 'error', text: 'Failed to load message. Check IDs.' });
        }
    };

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <h1 className="text-2xl font-bold mb-6 text-white">Embed Builder</h1>

            {/* Mode Switcher */}
            <div className="mb-6 bg-gray-800 p-4 rounded-lg">
                <div className="flex gap-4 mb-4">
                    <button 
                        onClick={() => setEditMode(false)}
                        className={`px-4 py-2 rounded ${!editMode ? 'bg-blue-600' : 'bg-gray-700'}`}
                    >
                        New Message
                    </button>
                    <button 
                        onClick={() => setEditMode(true)}
                        className={`px-4 py-2 rounded ${editMode ? 'bg-blue-600' : 'bg-gray-700'}`}
                    >
                        Edit Existing
                    </button>
                </div>

                {editMode ? (
                    <div className="flex gap-4 items-end">
                        <div className="flex-1">
                            <label className="block text-sm text-gray-400 mb-1">Channel ID</label>
                            <input 
                                type="text" 
                                value={editChannelId}
                                onChange={e => setEditChannelId(e.target.value)}
                                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                                placeholder="Channel ID"
                            />
                        </div>
                        <div className="flex-1">
                            <label className="block text-sm text-gray-400 mb-1">Message ID</label>
                            <input 
                                type="text" 
                                value={editMessageId}
                                onChange={e => setEditMessageId(e.target.value)}
                                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                                placeholder="Message ID"
                            />
                        </div>
                        <button onClick={loadMessage} className="bg-green-600 px-4 py-2 rounded h-10">Load</button>
                    </div>
                ) : (
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="block text-sm text-gray-400">Select Channel</label>
                            <button onClick={fetchChannels} className="text-xs text-blue-400 hover:text-blue-300">Refresh List</button>
                        </div>
                        <select 
                            value={selectedChannel}
                            onChange={e => setSelectedChannel(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                        >
                            {channels.length === 0 && <option>Loading or no channels...</option>}
                            {channels.map(c => (
                                <option key={c.value} value={c.value}>
                                    {c.label}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Editor Column */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Message Content (Outside Embed)</label>
                        <textarea 
                            value={messageContent}
                            onChange={e => setMessageContent(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white h-20"
                            placeholder="Text above the embed..."
                        />
                    </div>

                    <div className="bg-gray-800 p-4 rounded-lg space-y-4 border-l-4" style={{ borderColor: embed.color }}>
                        <h3 className="text-lg font-semibold text-gray-300">Embed Settings</h3>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-gray-400">Author Name</label>
                                <input 
                                    type="text" 
                                    value={embed.author?.name || ''}
                                    onChange={e => setEmbed({...embed, author: { ...embed.author, name: e.target.value }})}
                                    className="w-full bg-gray-700 rounded px-2 py-1"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400">Color (Hex)</label>
                                <input 
                                    type="color" 
                                    value={embed.color}
                                    onChange={e => setEmbed({...embed, color: e.target.value})}
                                    className="w-full h-8 bg-gray-700 rounded cursor-pointer"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm text-gray-400">Title</label>
                            <input 
                                type="text" 
                                value={embed.title}
                                onChange={e => setEmbed({...embed, title: e.target.value})}
                                className="w-full bg-gray-700 rounded px-2 py-1 font-bold"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-400">Description</label>
                            <textarea 
                                value={embed.description}
                                onChange={e => setEmbed({...embed, description: e.target.value})}
                                className="w-full bg-gray-700 rounded px-2 py-1 h-32"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-gray-400">Image URL</label>
                                <input 
                                    type="text" 
                                    value={embed.image || ''}
                                    onChange={e => setEmbed({...embed, image: e.target.value})}
                                    className="w-full bg-gray-700 rounded px-2 py-1"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400">Thumbnail URL</label>
                                <input 
                                    type="text" 
                                    value={embed.thumbnail || ''}
                                    onChange={e => setEmbed({...embed, thumbnail: e.target.value})}
                                    className="w-full bg-gray-700 rounded px-2 py-1"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm text-gray-400">Footer Text</label>
                            <input 
                                type="text" 
                                value={embed.footer?.text || ''}
                                onChange={e => setEmbed({...embed, footer: { ...embed.footer, text: e.target.value }})}
                                className="w-full bg-gray-700 rounded px-2 py-1"
                            />
                        </div>

                        {/* Fields */}
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-sm text-gray-400">Fields</label>
                                <button onClick={addField} className="text-xs bg-blue-600 px-2 py-1 rounded">+ Add Field</button>
                            </div>
                            {embed.fields.map((field, idx) => (
                                <div key={idx} className="bg-gray-700 p-2 rounded flex gap-2 items-start">
                                    <div className="flex-1 space-y-2">
                                        <input 
                                            type="text" 
                                            value={field.name} 
                                            onChange={e => handleFieldChange(idx, 'name', e.target.value)}
                                            className="w-full bg-gray-600 px-2 py-1 rounded text-sm"
                                            placeholder="Field Name"
                                        />
                                        <textarea 
                                            value={field.value} 
                                            onChange={e => handleFieldChange(idx, 'value', e.target.value)}
                                            className="w-full bg-gray-600 px-2 py-1 rounded text-sm"
                                            placeholder="Field Value"
                                        />
                                        <label className="flex items-center gap-2 text-xs text-gray-400">
                                            <input 
                                                type="checkbox" 
                                                checked={field.inline}
                                                onChange={e => handleFieldChange(idx, 'inline', e.target.checked)}
                                            /> Inline
                                        </label>
                                    </div>
                                    <button onClick={() => removeField(idx)} className="text-red-400 hover:text-red-300">×</button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Preview Column */}
                <div>
                    <h3 className="text-lg font-semibold text-gray-300 mb-4">Preview</h3>
                    <div className="bg-[#313338] p-4 rounded-lg shadow-lg font-sans text-gray-100">
                        {/* Message Content */}
                        {messageContent && <div className="mb-2 whitespace-pre-wrap">{messageContent}</div>}

                        {/* Embed */}
                        <div className="bg-[#2b2d31] rounded-l border-l-4 p-4 grid gap-2 max-w-md" style={{ borderColor: embed.color }}>
                            <div className="flex justify-between items-start">
                                <div>
                                    {embed.author?.name && (
                                        <div className="flex items-center gap-2 mb-1">
                                            {embed.author.icon_url && <img src={embed.author.icon_url} className="w-6 h-6 rounded-full" />}
                                            <span className="font-bold text-sm">{embed.author.name}</span>
                                        </div>
                                    )}
                                    {embed.title && <div className="font-bold text-base mb-1 text-blue-400">{embed.title}</div>}
                                    {embed.description && <div className="text-sm whitespace-pre-wrap text-gray-300">{embed.description}</div>}
                                </div>
                                {embed.thumbnail && <img src={embed.thumbnail} className="w-20 h-20 object-cover rounded ml-4" />}
                            </div>

                            {/* Fields */}
                            {embed.fields.length > 0 && (
                                <div className="grid grid-cols-12 gap-2 mt-2">
                                    {embed.fields.map((f, i) => (
                                        <div key={i} className={`${f.inline ? 'col-span-4' : 'col-span-12'}`}>
                                            <div className="font-bold text-xs text-gray-400 mb-1">{f.name}</div>
                                            <div className="text-sm text-gray-300 whitespace-pre-wrap">{f.value}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {embed.image && <img src={embed.image} className="w-full rounded mt-2" />}
                            
                            {embed.footer?.text && (
                                <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                                    {embed.footer.icon_url && <img src={embed.footer.icon_url} className="w-4 h-4 rounded-full" />}
                                    <span>{embed.footer.text}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <button 
                        onClick={handleSend}
                        className="mt-6 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg transition-colors"
                    >
                        {editMode ? 'Update Message' : 'Send Message'}
                    </button>

                    {statusMsg && (
                        <div className={`mt-4 p-3 rounded ${statusMsg.type === 'success' ? 'bg-green-900/50 text-green-200' : 'bg-red-900/50 text-red-200'}`}>
                            {statusMsg.text}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EmbedBuilder;
