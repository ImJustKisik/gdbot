// Mock config first
jest.mock('../../utils/config', () => ({
    GENAI_API_KEYS: ['key1', 'key2']
}));

// Mock GoogleGenerativeAI
const mockGetGenerativeModel = jest.fn();
const mockGoogleGenerativeAI = jest.fn(() => ({
    getGenerativeModel: mockGetGenerativeModel
}));

jest.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: mockGoogleGenerativeAI
}));

describe('Utils: AI', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules(); // Reset modules to trigger re-initialization of ai.js
        
        // Re-mock dependencies after resetModules
        jest.mock('../../utils/config', () => ({
            GENAI_API_KEYS: ['key1', 'key2']
        }));
        jest.mock('@google/generative-ai', () => ({
            GoogleGenerativeAI: mockGoogleGenerativeAI
        }));
    });

    test('should initialize models with provided keys', () => {
        // Require the module inside the test to trigger initialization
        require('../../utils/ai');
        
        expect(mockGoogleGenerativeAI).toHaveBeenCalledTimes(2);
        expect(mockGoogleGenerativeAI).toHaveBeenCalledWith('key1');
        expect(mockGoogleGenerativeAI).toHaveBeenCalledWith('key2');
    });
});
