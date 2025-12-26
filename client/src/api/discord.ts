import api from './client';

export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
  position: number;
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
  channels: DiscordChannel[];
}

export interface DiscordMessage {
  id: string;
  content: string;
  author: {
    id: string;
    username: string;
    avatar: string;
    bot: boolean;
    color: string;
  };
  timestamp: number;
  embeds: any[];
  attachments: {
    url: string;
    name: string;
    contentType: string;
  }[];
  reactions: {
    emoji: string;
    count: number;
  }[];
}

export const discordApi = {
  getGuild: async () => {
    const { data } = await api.get<DiscordGuild>('/discord/guild');
    return data;
  },

  getMessages: async (channelId: string, limit = 50, before?: string) => {
    const { data } = await api.get<DiscordMessage[]>(`/discord/channels/${channelId}/messages`, {
      params: { limit, before }
    });
    return data;
  }
};
