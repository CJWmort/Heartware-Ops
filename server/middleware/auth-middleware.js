// Route guards: requireLogin (must be logged in) and requireRole (must have the given role).

// requireLogin - a gate placed in front of a route. 1. Look at req.session.userId (filled in when the
// person logged in). 2. Missing -> stop and reply 401 "Please log in.". 3. Present -> call next() so
// the real route handler runs.
exports.requireLogin = (req, res, next) => {
    if (!req.session.userId) {
        return res.status(401).json({ message: 'Please log in.' });
    }
    next();
};

// requireRole('admin', ...) - like requireLogin but also checks the account type. 1. Not logged in ->
// 401. 2. Logged in but their role (req.session.role) is not in the allowed list -> 403 "Not
// allowed.". 3. Otherwise call next(). Use it as: router.get('/', requireRole('admin'), handler).
exports.requireRole = (...roles) => (req, res, next) => {
    if (!req.session.userId) return res.status(401).json({ message: 'Please log in.' });
    if (!roles.includes(req.session.role)) return res.status(403).json({ message: 'Not allowed.' });
    next();
};