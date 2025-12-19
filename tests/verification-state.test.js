const { createVerificationState, consumeVerificationState } = require('../verification-state');
const crypto = require('crypto');

describe('Verification State', () => {
    beforeEach(() => {
        // Clear any existing state if possible, or just rely on unique IDs
        // Since the module doesn't export a clear function, we rely on isolation or just creating new states.
    });

    test('should create a verification state', () => {
        const userId = '123456789';
        const state = createVerificationState(userId);
        
        expect(state).toBeDefined();
        expect(typeof state).toBe('string');
        expect(state.length).toBeGreaterThan(0);
    });

    test('should consume a valid state', () => {
        const userId = '987654321';
        const state = createVerificationState(userId);
        
        const result = consumeVerificationState(state);
        expect(result).toBe(userId);
    });

    test('should return null for invalid state', () => {
        const result = consumeVerificationState('invalid-state');
        expect(result).toBeNull();
    });

    test('should return null when consuming the same state twice', () => {
        const userId = '111222333';
        const state = createVerificationState(userId);
        
        consumeVerificationState(state); // First consumption
        const result = consumeVerificationState(state); // Second consumption
        
        expect(result).toBeNull();
    });

    test('should handle expiration (mocked)', () => {
        jest.useFakeTimers();
        const userId = 'expired-user';
        const state = createVerificationState(userId);
        
        // Fast-forward time by 11 minutes (expiration is 10 mins)
        jest.advanceTimersByTime(11 * 60 * 1000);
        
        const result = consumeVerificationState(state);
        expect(result).toBeNull();
        
        jest.useRealTimers();
    });
});
