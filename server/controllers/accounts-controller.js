// Get Service model
const Account = require('../models/account-model');

// Bcrypt used to Hash and protect passwords
const bcrypt = require('bcrypt');

exports.usersGet = async (req,res) => {
    try {
        const userList = await Account.retrieveAll();
        res.json(userList);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.userCreate = async (req, res) => {
    try {
        const { name, email, address, postalCode, phone, password, role } = req.body;

        // Hash before saving, never store the plain password
        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await Account.create({
            name,
            email,
            address,
            postalCode,
            phone,
            password: hashedPassword,
            role
        });

        // Send back only safe fields, never the password hash
        res.status(201).json({
            _id: user._id,
            name: user.name,
            email: user.email
        });
    } catch (error) {
        // Duplicate name / email / phone (unique fields)
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(409).json({ message: `That ${field} is already registered.` });
        }
        // Schema validation errors (e.g. bad phone format)
        if (error.name === 'ValidationError') {
            const message = Object.values(error.errors)[0].message;
            return res.status(400).json({ message });
        }
        res.status(500).json({ message: 'Could not create account.' });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Enter your email and password.' });
        }

        const user = await Account.findByEmail(email);
        const valid = user && await bcrypt.compare(password, user.password);

        // Same message for "no such user" and "wrong password"
        if (!valid) {
            return res.status(401).json({ message: 'Incorrect email or password.' });
        }
        
        // New session ID on login
        req.session.regenerate((err) => {
            if (err) return res.status(500).json({ message: 'Login failed.' });

            req.session.userId = user._id.toString();
            req.session.role = user.role;

            res.json({ _id: user._id, name: user.name, email: user.email, role: user.role });
        });
    } catch (error) {
        res.status(500).json({ message: 'Login failed.' });
    }
};

exports.logout = (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ message: 'Logged out' });
    });
};

// Check if user still logged in after a page refresh
exports.me = async (req, res) => {
    try {
        const user = await Account.findById(req.session.userId);
        if (!user) return res.status(401).json({ message: 'Not logged in' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Could not load user.' });
    }
};