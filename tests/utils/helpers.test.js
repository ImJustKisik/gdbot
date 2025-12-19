const { ChannelType } = require('discord.js');
const helpers = require('../../utils/helpers');

// Mock dependencies
jest.mock('../../db', () => ({
    getSetting: jest.fn()
}));

jest.mock('../../bot/client', () => ({
    guilds: {
        cache: {
            get: jest.fn(),
            fetch: jest.fn()
        }
    }
}));

jest.mock('../../utils/config', () => ({
    DEFAULT_SETTINGS: {
        logChannelId: 'default-log-channel'
    },
    CLIENT_ID: 'mock-client-id',
    REDIRECT_URI: 'http://mock-redirect',
    GUILD_ID: 'mock-guild-id'
}));

describe('Utils: Helpers', () => {
    
    describe('isSnowflake', () => {
        test('should return true for valid snowflake', () => {
            expect(helpers.isSnowflake('123456789012345678')).toBe(true);
            expect(helpers.isSnowflake('12345')).toBe(true);
        });

        test('should return false for invalid snowflake', () => {
            expect(helpers.isSnowflake('abc')).toBe(false);
            expect(helpers.isSnowflake('1234')).toBe(false); // Regex is \d{5,}
            expect(helpers.isSnowflake(123456)).toBe(false); // Must be string
            expect(helpers.isSnowflake(null)).toBe(false);
        });
    });

    describe('isTextBasedGuildChannel', () => {
        test('should return true for GuildText', () => {
            const channel = { type: ChannelType.GuildText };
            expect(helpers.isTextBasedGuildChannel(channel)).toBe(true);
        });

        test('should return true for GuildAnnouncement', () => {
            const channel = { type: ChannelType.GuildAnnouncement };
            expect(helpers.isTextBasedGuildChannel(channel)).toBe(true);
        });

        test('should return false for other types', () => {
            expect(helpers.isTextBasedGuildChannel({ type: ChannelType.GuildVoice })).toBe(false);
            expect(helpers.isTextBasedGuildChannel(null)).toBe(false);
        });
    });

    describe('findChannelBySetting', () => {
        const mockChannels = [
            { id: '11111', name: 'general' },
            { id: '22222', name: 'verification' }
        ];
        
        const mockGuild = {
            channels: {
                cache: {
                    get: jest.fn(id => mockChannels.find(c => c.id === id)),
                    find: jest.fn(cb => mockChannels.find(cb))
                }
            }
        };

        test('should find channel by ID', () => {
            const result = helpers.findChannelBySetting(mockGuild, '11111');
            expect(result).toEqual(mockChannels[0]);
        });

        test('should find channel by name (case insensitive)', () => {
            const result = helpers.findChannelBySetting(mockGuild, 'General');
            expect(result).toEqual(mockChannels[0]);
        });

        test('should return null if not found', () => {
            const result = helpers.findChannelBySetting(mockGuild, 'nonexistent');
            expect(result).toBeNull();
        });
    });

    describe('findRoleBySetting', () => {
        const mockRoles = [
            { id: '99999', name: 'Admin' },
            { id: '88888', name: 'Verified' }
        ];
        
        const mockGuild = {
            roles: {
                cache: {
                    get: jest.fn(id => mockRoles.find(r => r.id === id)),
                    find: jest.fn(cb => mockRoles.find(cb))
                }
            }
        };

        test('should find role by ID', () => {
            const result = helpers.findRoleBySetting(mockGuild, '99999');
            expect(result).toEqual(mockRoles[0]);
        });

        test('should find role by name (case insensitive)', () => {
            const result = helpers.findRoleBySetting(mockGuild, 'verified');
            expect(result).toEqual(mockRoles[1]);
        });
    });
});
