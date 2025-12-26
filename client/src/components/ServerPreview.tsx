import React, { useEffect, useState, useRef } from 'react';
import { Hash, Volume2, ChevronDown, Search, Smile, MoreVertical, FileText } from 'lucide-react';
import { discordApi, DiscordGuild, DiscordChannel, DiscordMessage } from '../api/discord';
import { format } from 'date-fns';

export const ServerPreview: React.FC = () => {
  const [guild, setGuild] = useState<DiscordGuild | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<DiscordChannel | null>(null);
  const [messages, setMessages] = useState<DiscordMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadGuild();
  }, []);

  useEffect(() => {
    if (selectedChannel && selectedChannel.type === 0) { // 0 is GUILD_TEXT
      loadMessages(selectedChannel.id);
    }
  }, [selectedChannel]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadGuild = async () => {
    try {
      const data = await discordApi.getGuild();
      console.log('ServerPreview: Guild data loaded:', data);
      setGuild(data);
      // Select first text channel by default
      const firstText = data.channels.find(c => c.type === 0);
      if (firstText) setSelectedChannel(firstText);
    } catch (error) {
      console.error('Failed to load guild:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (channelId: string) => {
    setLoadingMessages(true);
    try {
      const data = await discordApi.getMessages(channelId);
      setMessages(data);
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setLoadingMessages(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const groupChannels = (channels: DiscordChannel[]) => {
    const categories = new Map<string | null, DiscordChannel[]>();

    // First pass: find all categories (type 4)
    // Actually the API returns a flat list, but we have parentId
    // We need to organize them.
    
    // Let's just group by parentId
    channels.forEach(c => {
        if (c.type === 4) return; // Skip category channels themselves in the item list
        const parentId = c.parentId;
        if (!categories.has(parentId)) {
            categories.set(parentId, []);
        }
        categories.get(parentId)?.push(c);
    });

    return categories;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!guild) return <div>Failed to load server preview</div>;

  // Extract categories from the channels list
  const categories = guild.channels
    .filter(c => c.type === 4)
    .sort((a, b) => a.position - b.position);

  const channelsByParent = groupChannels(guild.channels);

  return (
    <div className="flex h-[calc(100vh-6rem)] glass-panel overflow-hidden">
      {/* Sidebar - Channel List */}
      <div className="w-64 bg-gray-900/50 border-r border-white/10 flex flex-col">
        <div className="p-4 border-b border-white/10 shadow-sm">
          <h2 className="font-bold text-white truncate">{guild.name}</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-4 custom-scrollbar">
          {/* No Category Channels */}
          {channelsByParent.get(null)?.map(channel => (
            <ChannelItem 
              key={channel.id} 
              channel={channel} 
              isSelected={selectedChannel?.id === channel.id}
              onClick={() => setSelectedChannel(channel)}
            />
          ))}

          {/* Categories */}
          {categories.map(category => {
            const categoryChannels = channelsByParent.get(category.id);
            if (!categoryChannels || categoryChannels.length === 0) return null;

            return (
              <div key={category.id}>
                <div className="flex items-center px-2 mb-1 text-xs font-bold text-gray-400 uppercase hover:text-gray-300 cursor-pointer">
                  <ChevronDown size={12} className="mr-1" />
                  {category.name}
                </div>
                <div className="space-y-0.5">
                  {categoryChannels.map(channel => (
                    <ChannelItem 
                      key={channel.id} 
                      channel={channel} 
                      isSelected={selectedChannel?.id === channel.id}
                      onClick={() => setSelectedChannel(channel)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        
        {/* User Area (Bot) */}
        <div className="p-3 bg-black/20 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
                B
            </div>
            <div className="flex-1 overflow-hidden">
                <div className="text-sm font-bold text-white truncate">Bot Name</div>
                <div className="text-xs text-gray-400">#1234</div>
            </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-gray-800/30">
        {/* Chat Header */}
        <div className="h-12 border-b border-white/10 flex items-center px-4 justify-between shadow-sm bg-white/5 backdrop-blur-md">
          <div className="flex items-center gap-2 text-white">
            <Hash className="text-gray-400" size={20} />
            <span className="font-bold">{selectedChannel?.name}</span>
            {selectedChannel?.type === 0 && <span className="text-xs text-gray-400 ml-2 hidden sm:inline">Text Channel</span>}
          </div>
          <div className="flex items-center gap-4 text-gray-400">
            <Search size={20} className="cursor-pointer hover:text-gray-200" />
            <MoreVertical size={20} className="cursor-pointer hover:text-gray-200" />
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {loadingMessages ? (
            <div className="flex justify-center py-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <div className="p-4 bg-white/5 rounded-full mb-4">
                    <Hash size={48} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Welcome to #{selectedChannel?.name}!</h3>
                <p>This is the start of the #{selectedChannel?.name} channel.</p>
            </div>
          ) : (
            messages.map((msg, idx) => {
                const prevMsg = messages[idx - 1];
                const isSameAuthor = prevMsg && prevMsg.author.id === msg.author.id && (msg.timestamp - prevMsg.timestamp < 5 * 60 * 1000);
                
                return (
                    <MessageItem 
                        key={msg.id} 
                        message={msg} 
                        isCompact={isSameAuthor} 
                    />
                );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input (Read Only) */}
        <div className="p-4 pt-0">
          <div className="bg-gray-700/50 rounded-lg p-2 flex items-center gap-3 cursor-not-allowed opacity-75">
            <div className="p-1 text-gray-400 hover:text-gray-200">
                <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center">
                    <span className="text-xs font-bold">+</span>
                </div>
            </div>
            <input 
              type="text" 
              placeholder={`Message #${selectedChannel?.name} (Read Only)`}
              className="bg-transparent flex-1 outline-none text-gray-300 placeholder-gray-500 cursor-not-allowed"
              disabled
            />
            <div className="flex items-center gap-3 text-gray-400">
                <Smile size={20} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ChannelItem: React.FC<{ 
  channel: DiscordChannel; 
  isSelected: boolean; 
  onClick: () => void 
}> = ({ channel, isSelected, onClick }) => {
  const Icon = channel.type === 2 ? Volume2 : Hash;
  
  return (
    <div 
      onClick={onClick}
      className={`flex items-center px-2 py-1.5 mx-2 rounded cursor-pointer group transition-colors ${
        isSelected 
          ? 'bg-gray-700/60 text-white' 
          : 'text-gray-400 hover:bg-gray-800/40 hover:text-gray-200'
      }`}
    >
      <Icon size={18} className="mr-1.5 text-gray-500 group-hover:text-gray-400" />
      <span className={`truncate ${isSelected ? 'font-medium' : ''}`}>{channel.name}</span>
    </div>
  );
};

const MessageItem: React.FC<{ 
  message: DiscordMessage; 
  isCompact: boolean 
}> = ({ message, isCompact }) => {
  return (
    <div className={`group flex pr-4 hover:bg-black/5 -mx-4 px-4 py-0.5 ${isCompact ? 'mt-0.5' : 'mt-4'}`}>
      {!isCompact ? (
        <div className="w-10 h-10 rounded-full bg-gray-600 mr-4 flex-shrink-0 overflow-hidden mt-0.5 cursor-pointer hover:opacity-80 transition-opacity">
            <img src={message.author.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'} alt="" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="w-10 mr-4 flex-shrink-0 text-xs text-gray-500 opacity-0 group-hover:opacity-100 text-right select-none pt-1">
            {format(new Date(message.timestamp), 'HH:mm')}
        </div>
      )}
      
      <div className="flex-1 min-w-0">
        {!isCompact && (
          <div className="flex items-center gap-2 mb-0.5">
            <span 
                className="font-medium text-white hover:underline cursor-pointer"
                style={{ color: message.author.color !== '#ffffff' ? message.author.color : undefined }}
            >
                {message.author.username}
            </span>
            {message.author.bot && (
                <span className="bg-[#5865F2] text-white text-[10px] px-1.5 rounded-[3px] h-[15px] flex items-center leading-none">BOT</span>
            )}
            <span className="text-xs text-gray-400 ml-1">
                {format(new Date(message.timestamp), 'MM/dd/yyyy HH:mm')}
            </span>
          </div>
        )}
        
        <div className={`text-gray-300 whitespace-pre-wrap break-words leading-relaxed ${isCompact ? '' : ''}`}>
            {message.content}
        </div>

        {/* Embeds */}
        {message.embeds && message.embeds.length > 0 && (
            <div className="space-y-2 mt-2">
                {message.embeds.map((embed, idx) => (
                    <div key={idx} className="bg-[#2f3136] border-l-4 rounded p-3 max-w-lg" style={{ borderLeftColor: embed.color ? `#${embed.color.toString(16)}` : '#202225' }}>
                        {embed.title && <div className="font-bold text-white mb-1">{embed.title}</div>}
                        {embed.description && <div className="text-sm text-gray-300">{embed.description}</div>}
                        {embed.fields && (
                            <div className="grid grid-cols-1 gap-2 mt-2">
                                {embed.fields.map((field: any, fIdx: number) => (
                                    <div key={fIdx}>
                                        <div className="text-xs font-bold text-gray-400">{field.name}</div>
                                        <div className="text-sm text-gray-300">{field.value}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {embed.image && (
                            <img src={embed.image.url} alt="" className="mt-2 rounded max-w-full max-h-64 object-contain" />
                        )}
                    </div>
                ))}
            </div>
        )}

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
                {message.attachments.map((att, idx) => (
                    <div key={idx}>
                        {att.contentType?.startsWith('image/') ? (
                            <img src={att.url} alt={att.name} className="max-w-sm max-h-64 rounded cursor-pointer hover:opacity-90" />
                        ) : (
                            <div className="flex items-center gap-2 bg-[#2f3136] p-3 rounded border border-[#202225]">
                                <FileText size={24} className="text-blue-400" />
                                <div>
                                    <div className="text-blue-400 hover:underline cursor-pointer truncate max-w-[200px]">{att.name}</div>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        )}
      </div>
    </div>
  );
};
