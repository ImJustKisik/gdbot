const verifyCommand = require('../../../bot/commands/verify');
const helpers = require('../../../utils/helpers');

// Mocks
jest.mock('../../../utils/helpers', () => ({
    getConfiguredRole: jest.fn(),
    logAction: jest.fn()
}));

describe('Command: /verify', () => {
    let interaction;
    let mockMember;
    let mockUnverifiedRole;
    let mockVerifiedRole;

    beforeEach(() => {
        jest.clearAllMocks();

        mockMember = {
            id: 'target-id',
            roles: {
                add: jest.fn().mockResolvedValue(true),
                remove: jest.fn().mockResolvedValue(true)
            }
        };

        mockUnverifiedRole = { id: 'role-unverified' };
        mockVerifiedRole = { id: 'role-verified' };

        interaction = {
            deferReply: jest.fn(),
            editReply: jest.fn(),
            user: { tag: 'Admin#1234' },
            guild: {
                members: {
                    fetch: jest.fn().mockResolvedValue(mockMember)
                }
            },
            options: {
                getUser: jest.fn().mockReturnValue({ id: 'target-id', tag: 'Target#0000' })
            }
        };
    });

    test('should verify user by swapping roles', async () => {
        helpers.getConfiguredRole.mockImplementation((guild, key) => {
            if (key === 'roleUnverified') return mockUnverifiedRole;
            if (key === 'roleVerified') return mockVerifiedRole;
            return null;
        });

        await verifyCommand.execute(interaction);

        expect(mockMember.roles.remove).toHaveBeenCalledWith(mockUnverifiedRole);
        expect(mockMember.roles.add).toHaveBeenCalledWith(mockVerifiedRole);
        expect(helpers.logAction).toHaveBeenCalled();
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('✅ Manually verified') }));
    });

    test('should handle missing roles gracefully', async () => {
        helpers.getConfiguredRole.mockReturnValue(null);

        await verifyCommand.execute(interaction);

        expect(mockMember.roles.remove).not.toHaveBeenCalled();
        expect(mockMember.roles.add).not.toHaveBeenCalled();
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('✅ Manually verified') }));
    });

    test('should return error if user not found', async () => {
        interaction.guild.members.fetch.mockRejectedValue(new Error('Not found'));

        await verifyCommand.execute(interaction);

        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: 'User not found in this server.' }));
    });
});
