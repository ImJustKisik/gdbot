const axios = require('axios');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');

jest.mock('axios');
jest.mock('child_process');
jest.mock('../../utils/config', () => ({
    GENAI_API_KEYS: ['key1'],
    IMAGE_API_KEY: 'image_key'
}));

describe('Utils: AI', () => {
    let mockPythonProcess;
    let ai;
    let axios;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
        
        // Mock Python process
        mockPythonProcess = new EventEmitter();
        mockPythonProcess.stdout = new EventEmitter();
        mockPythonProcess.stderr = new EventEmitter();
        mockPythonProcess.stdin = { write: jest.fn() };
        mockPythonProcess.kill = jest.fn();
        
        require('child_process').spawn.mockReturnValue(mockPythonProcess);
        
        // Re-mock config because resetModules clears it
        jest.mock('../../utils/config', () => ({
            GENAI_API_KEYS: ['key1'],
            IMAGE_API_KEY: 'image_key'
        }));
        
        // Re-require axios and setup mock
        axios = require('axios');
        axios.post = jest.fn();

        // Require ai module
        ai = require('../../utils/ai');
    });

    test('should initialize python bridge', () => {
        expect(require('child_process').spawn).toHaveBeenCalled();
    });

    test('analyzeContent should call OpenRouter API', async () => {
        const mockResponse = {
            data: {
                choices: [{
                    message: {
                        content: JSON.stringify({
                            violation: true,
                            reason: "Test violation",
                            severity: 80,
                            comment: "Bad content"
                        })
                    }
                }]
            }
        };
        axios.post.mockResolvedValue(mockResponse);
        
        const result = await ai.analyzeContent('Test bad text');
        
        expect(axios.post).toHaveBeenCalledWith(
            "https://openrouter.ai/api/v1/chat/completions",
            expect.any(Object),
            expect.any(Object)
        );
        expect(result).toEqual({
            violation: true,
            reason: "Test violation",
            severity: 80,
            comment: "Bad content"
        });
    });
});
