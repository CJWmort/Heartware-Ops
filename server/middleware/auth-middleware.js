exports.requireLogin = (req, res, next) => {
    if (!req.session.userId) {
        return res.status(401).json({ message: 'Please log in.' });
    }
    next();
};

exports.requireRole = (...roles) => (req, res, next) => {
    if (!req.session.userId) return res.status(401).json({ message: 'Please log in.' });
    if (!roles.includes(req.session.role)) return res.status(403).json({ message: 'Not allowed.' });
    next();
};