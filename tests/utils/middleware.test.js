const { requireAuth } = require('../../utils/middleware');

describe('Utils: Middleware', () => {
    let req, res, next;

    beforeEach(() => {
        req = {
            session: {}
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        next = jest.fn();
    });

    test('should call next() if user is authenticated', () => {
        req.session.user = { id: '123', username: 'testuser' };
        
        requireAuth(req, res, next);
        
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });

    test('should return 401 if user is not authenticated', () => {
        req.session.user = undefined;
        
        requireAuth(req, res, next);
        
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });
});
