const warnCommand = require('../../bot/commands/warn');
const db = require('../../db');
const helpers = require('../../utils/helpers');

jest.mock('../../db', () => ({
  getPresets: jest.fn(),
  addWarning: jest.fn(),
  getUser: jest.fn(),
  getEscalations: jest.fn(),
}));

jest.mock('../../utils/helpers', () => ({
  logAction: jest.fn(),
  getAppSetting: jest.fn(),
}));

describe('Command /warn edge cases', () => {
  let interaction;
  let mockMember;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMember = {
      id: 'target',
      send: jest.fn().mockRejectedValue(new Error('DM closed')),
      timeout: jest.fn().mockResolvedValue(true),
      moderatable: false,
    };
    interaction = {
      deferReply: jest.fn(),
      editReply: jest.fn(),
      respond: jest.fn(),
      user: { tag: 'Mod#1' },
      guild: {
        members: {
          fetch: jest.fn().mockResolvedValue(mockMember),
        },
      },
      options: {
        getUser: jest.fn().mockReturnValue({ id: 'target', tag: 'Target#0000' }),
        getString: jest.fn().mockImplementation(name => (name === 'reason' ? 'Spam' : null)),
        getInteger: jest.fn().mockReturnValue(5),
        getAttachment: jest.fn(),
        getBoolean: jest.fn(),
        getFocused: jest.fn(),
      },
    };
  });

  test('does not timeout when moderatable=false but still warns', async () => {
    db.getUser.mockReturnValue({ points: 10 });
    db.getEscalations.mockReturnValue([{ threshold: 5, action: 'mute', duration: 60 }]);
    helpers.getAppSetting.mockReturnValue(20);

    await warnCommand.execute(interaction);

    expect(db.addWarning).toHaveBeenCalled();
    expect(mockMember.timeout).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
  });

  test('gracefully handles DM failure', async () => {
    db.getUser.mockReturnValue({ points: 1 });
    db.getEscalations.mockReturnValue([]);
    helpers.getAppSetting.mockReturnValue(20);

    await warnCommand.execute(interaction);

    expect(db.addWarning).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
  });
});
