const warnCommand = require('../../../bot/commands/warn');
const db = require('../../../db');
const helpers = require('../../../utils/helpers');

// Mocks
jest.mock('../../../db', () => ({
    getPresets: jest.fn(),
    addWarning: jest.fn(),
    getUser: jest.fn(),
    getEscalations: jest.fn()
}));

jest.mock('../../../utils/helpers', () => ({
    logAction: jest.fn(),
    getAppSetting: jest.fn()
}));

describe('Command: /warn', () => {
    let interaction;
    let mockMember;

    beforeEach(() => {
        jest.clearAllMocks();

        mockMember = {
            id: 'target-id',
            send: jest.fn().mockResolvedValue(true),
            timeout: jest.fn().mockResolvedValue(true),
            moderatable: true
        };

        interaction = {
            deferReply: jest.fn(),
            editReply: jest.fn(),
            respond: jest.fn(),
            user: { tag: 'Moderator#1234' },
            guild: {
                members: {
                    fetch: jest.fn().mockResolvedValue(mockMember)
                }
            },
            options: {
                getUser: jest.fn().mockReturnValue({ id: 'target-id', tag: 'Target#0000' }),
                getString: jest.fn(),
                getInteger: jest.fn(),
                getAttachment: jest.fn(),
                getBoolean: jest.fn(),
                getFocused: jest.fn()
            }
        };
    });

    test('should warn user with custom reason and points', async () => {
        interaction.options.getString.mockImplementation((name) => {
            if (name === 'reason') return 'Spamming';
            return null;
        });
        interaction.options.getInteger.mockReturnValue(5);

        db.getUser.mockReturnValue({ points: 5 });
        db.getEscalations.mockReturnValue([]);

        await warnCommand.execute(interaction);

        expect(db.addWarning).toHaveBeenCalledWith('target-id', expect.objectContaining({
            reason: 'Spamming',
            points: 5,
            moderator: 'Moderator#1234'
        }));
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('✅ Warned Target#0000') }));
        expect(mockMember.send).toHaveBeenCalled();
    });

    test('should use preset if selected', async () => {
        const mockPreset = { id: 1, name: 'Bad Language', points: 3 };
        db.getPresets.mockReturnValue([mockPreset]);
        
        interaction.options.getString.mockImplementation((name) => {
            if (name === 'preset') return '1';
            return null;
        });

        db.getUser.mockReturnValue({ points: 3 });
        db.getEscalations.mockReturnValue([]);

        await warnCommand.execute(interaction);

        expect(db.addWarning).toHaveBeenCalledWith('target-id', expect.objectContaining({
            reason: 'Bad Language',
            points: 3
        }));
    });

    test('should fail if no reason or preset provided', async () => {
        interaction.options.getString.mockReturnValue(null);
        interaction.options.getInteger.mockReturnValue(null);

        await warnCommand.execute(interaction);

        expect(db.addWarning).not.toHaveBeenCalled();
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('❌ You must provide a reason') }));
    });

    test('should auto-mute if threshold reached', async () => {
        interaction.options.getString.mockReturnValue('Spam');
        interaction.options.getInteger.mockReturnValue(20);

        db.getUser.mockReturnValue({ points: 20 });
        db.getEscalations.mockReturnValue([
            { threshold: 20, action: 'mute', duration: 60 }
        ]);

        await warnCommand.execute(interaction);

        expect(mockMember.timeout).toHaveBeenCalledWith(60 * 60 * 1000, expect.stringContaining('Auto-punish'));
    });

    test('should handle autocomplete', async () => {
        interaction.options.getFocused.mockReturnValue('bad');
        db.getPresets.mockReturnValue([
            { id: 1, name: 'Bad Language', points: 3 },
            { id: 2, name: 'Spam', points: 5 }
        ]);

        await warnCommand.autocomplete(interaction);

        expect(interaction.respond).toHaveBeenCalledWith([
            { name: 'Bad Language (3 pts)', value: '1' }
        ]);
    });
});
