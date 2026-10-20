// Get Service model
const Account = require('../models/account-model');
const onemap = require('../services/onemap');

// Bcrypt used to Hash and protect passwords
const bcrypt = require('bcrypt');
const otp = require('../utils/otp'); // email verification codes (Brevo)
const Assignments = require('../models/assignments-model'); // NEW: needed to tidy allocations when availability changes

// NEW (availability change): FIX for "stale allocations". Before, a volunteer could untick a show AFTER being allocated
// to it, and the allocation stayed, so the school place was held by someone who said they could not come.
// Call this with the shows being removed. Returns an error message if the change must be refused, otherwise ''.
//  - already ACCEPTED a place in one of them -> refuse (they must press "Can't make it" first, so the withdrawal is recorded
//    with a reason and can be offered to a replacement)
//  - Pending / Reserve rows -> deleted, which frees the place
async function releaseRemovedShows(userId, removedShows) {
    if (removedShows.length === 0) return '';
    const accepted = await Assignments.acceptedShowsAmong(userId, removedShows);
    if (accepted.length > 0) {
        return `You have accepted a place in ${accepted.join(', ')}. Press "Can't make it" on My Assignment first, then remove the show.`;
    }
    await Assignments.deleteOpenForShows(userId, removedShows);
    return '';
}

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
        // role is NOT read from the request: public sign-up can only ever create volunteers
        const { name, email, address, postalCode, phone, password } = req.body;
        // NEW: the spec requires consent before location tracking, so no consent = no account.
        // `=== true` (not just truthy) so the text "false" cannot slip through.
        if (req.body.locationConsent !== true) {
            return res.status(400).json({ message: 'Please agree to location sharing to sign up.' });
        }
        // Volunteers must have verified their email with the 6-digit code first
        if (!otp.useVerifiedEmail(email)) {
            return res.status(400).json({ message: 'Please verify your email with the 6-digit code first.' });
        }
        // Hash before saving, never store the plain password
        const hashedPassword = await bcrypt.hash(password, 10);
        const coordinates = await onemap.geocodePostal(postalCode);
        // FIX: OneMap can find nothing for a postal code; before, `coordinates.lat` below crashed and the user saw a vague 500
        if (!coordinates) {
            return res.status(400).json({ message: 'We could not find that postal code. Please check it and try again.' });
        }

        const user = await Account.create({
            name,
            email,
            address,
            postalCode,
            phone,
            password: hashedPassword,
            role: 'volunteer', // fixed on the server: the sign-up form can no longer make itself an admin
            locationConsentAt: new Date(), // NEW: proof of when they agreed
            lat: coordinates.lat,
            lng: coordinates.lng
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

// Update current logged in user's available shows
// PUT /api/users/me  body: { availableShows: ["NE Show 2", ...] }
exports.updateMe = async (req, res) => {
    try {
        const { availableShows } = req.body;
        if (!Array.isArray(availableShows) || !availableShows.every(s => typeof s === 'string')) {
            return res.status(400).json({ message: 'availableShows must be an array of strings.' });
        }

        // NEW: work out which shows are being UNTICKED (were available, are not in the new list) and tidy their allocations first
        const current = await Account.findById(req.session.userId);
        if (!current) return res.status(401).json({ message: 'Not logged in' });
        const removed = (current.availableShows || []).filter((s) => !availableShows.includes(s));
        const problem = await releaseRemovedShows(req.session.userId, removed);
        if (problem) return res.status(409).json({ message: problem }); // 409 = clashes with an accepted place

        const user = await Account.updateAvailableShows(req.session.userId, availableShows);
        if (!user) return res.status(401).json({ message: 'Not logged in' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Could not update user.' });
    }
};

// Remove shows from current logged in user's available shows
// DELETE /api/users/me  body: { availableShows: ["NE Show 2", ...] }
exports.removeMyShows = async (req, res) => {
    try {
        const { availableShows } = req.body;
        if (!Array.isArray(availableShows) || !availableShows.every(s => typeof s === 'string')) {
            return res.status(400).json({ message: 'availableShows must be an array of strings.' });
        }

        // NEW: same allocation tidy-up as PUT /me (only the shows the volunteer really had ticked count as removed)
        const current = await Account.findById(req.session.userId);
        if (!current) return res.status(401).json({ message: 'Not logged in' });
        const removed = availableShows.filter((s) => (current.availableShows || []).includes(s));
        const problem = await releaseRemovedShows(req.session.userId, removed);
        if (problem) return res.status(409).json({ message: problem });

        const user = await Account.removeAvailableShows(req.session.userId, availableShows);
        if (!user) return res.status(401).json({ message: 'Not logged in' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Could not update user.' });
    }
};

exports.volunteerLocations = async (req, res) => {
    try {
        const volunteers = await Account.retrieveVolunteers();

        // FIX (speed): this used to call OneMap once PER VOLUNTEER on every request (400 volunteers = 400 web calls,
        // slow and likely to be throttled). Every account already stores lat/lng from sign-up, so just use those.
        const result = volunteers
            .filter((v) => typeof v.lat === 'number' && typeof v.lng === 'number') // skip any account without coordinates
            .map((v) => ({ _id: v._id, name: v.name, lat: v.lat, lng: v.lng, address: v.address }));

        res.json(result);
    } catch (error) {
        res.status(500).json({ message: 'Could not load volunteer locations.' });
    }
};

// Routing from start to end points
exports.route = async (req, res) => {
    const { startLat, startLng, endLat, endLng } = req.query;
    const routeType = ['walk', 'drive', 'cycle'].includes(req.query.routeType) ? req.query.routeType : 'walk';

    const nums = [startLat, startLng, endLat, endLng].map(Number);
    if (nums.some(Number.isNaN)) {
        return res.status(400).json({ message: 'Invalid coordinates.' });
    }

    try {
        res.json(await onemap.getRoute(`${startLat},${startLng}`, `${endLat},${endLng}`, routeType));
    } catch (error) {
        console.error('Routing failed:', error.message);
        res.status(502).json({ message: 'Could not get a route from OneMap.' });
    }
};

// Registration form: postal code -> address
// GET /api/users/postal-lookup?postalCode=560123  ->  { address, lat, lng }
exports.postalLookup = async (req, res) => {
    const postalCode = (req.query.postalCode || '').trim();
    if (!/^\d{6}$/.test(postalCode)) {
        return res.status(400).json({ message: 'Enter a 6-digit postal code.' });
    }
    try {
        const place = await onemap.lookupPostal(postalCode);
        if (!place) return res.status(404).json({ message: 'No address found for this postal code.' });
        res.json(place);
    } catch (error) {
        console.error('Postal lookup failed:', error.message);
        res.status(502).json({ message: 'Could not reach OneMap. Please type your address.' });
    }
};

// Registration form: address text -> matching places (each with a postal code)
// GET /api/users/address-search?q=ang mo kio ave 3  ->  [{ address, postal, lat, lng }, ...]
exports.addressSearch = async (req, res) => {
    const q = (req.query.q || '').trim();
    if (q.length < 3) {
        return res.status(400).json({ message: 'Type at least 3 characters to search.' });
    }
    try {
        res.json(await onemap.searchAddress(q));
    } catch (error) {
        console.error('Address search failed:', error.message);
        res.status(502).json({ message: 'Could not reach OneMap. Please type your address.' });
    }
};

// ---------- Email OTP (registration) ----------

// POST /api/users/otp/request   { email }  ->  { resendInSeconds, devCode? }
exports.otpRequest = async (req, res) => {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    try {
        // Don't send a code if the email already has an account
        if (await Account.findByEmail(email)) {
            return res.status(409).json({ message: 'That email is already registered. Try logging in.' });
        }
        // Same for the phone number (checked now, so they don't enter the code for nothing)
        const phone = (req.body.phone || '').replace(/\s+/g, '');
        if (phone && await Account.findByPhone(phone)) {
            return res.status(409).json({ message: 'That phone number is already registered. Try logging in.' });
        }
        const result = await otp.requestCode(email);
        res.json(result);
    } catch (error) {
        if (error.status === 429) return res.status(429).json({ message: error.message });
        console.error('OTP email failed:', error.message);
        res.status(502).json({ message: 'Could not send the code email. Please try again.' });
    }
};

// POST /api/users/otp/verify   { email, code }  ->  { verified: true }
exports.otpVerify = (req, res) => {
    const { email, code } = req.body;
    const message = otp.checkCode(email, code);
    if (message) return res.status(400).json({ message });
    res.json({ verified: true });
};

