// Account endpoints: register, login, logout, who am I, update profile, remove shows, volunteer
// positions and the OneMap postal code, address and route lookups.

const Account = require("../models/account-model");
const onemap = require("../services/onemap");
const { replaceFromReserve } = require("../utils/reserve-replacement");

const bcrypt = require("bcrypt");
const otp = require("../utils/otp");
const Assignments = require("../models/assignments-model");
const { disconnectUser } = require("../sockets");
const sendServerError = require('../utils/send-server-error')

// releaseRemovedShows(userId, removedShows) - tidies allocations when a volunteer unticks shows they
// can attend. 1. Nothing removed -> return "" (success). 2. Ask the database which of the removed
// shows the volunteer has already ACCEPTED a place in. 3. If any -> return an error text telling them
// to press "Withdraw" first (so the withdrawal is recorded). 4. Otherwise delete their Pending /
// Reserve rows for those shows (this frees school places). 5. For each removed show, try to fill the
// freed place from the reserve list; a failure is only logged. 6. Return "" so the caller continues.
async function releaseRemovedShows(userId, removedShows) {
  if (removedShows.length === 0) return "";
  const accepted = await Assignments.acceptedShowsAmong(userId, removedShows);
  if (accepted.length > 0) {
    return `You have accepted a place in ${accepted.join(", ")}. Press "Withdraw" on My Assignment first, then remove the show.`;
  }
  await Assignments.deleteOpenForShows(userId, removedShows);
  for (const show of removedShows) {
    try {
      await replaceFromReserve(show);
    } catch (fillError) {
      console.error(`Reserve replacement for ${show} failed:`, fillError.message);
    }
  }
  return "";
}

// usersGet - admin: list every account. 1) ask the model for all accounts 2) reply with the list 3) on
// error reply 500.
exports.usersGet = async (req, res) => {
  try {
    const userList = await Account.retrieveAll();
    res.json(userList);
  } catch (error) {
    sendServerError(res, error);
  }
};

// userCreate - public sign-up (always makes a VOLUNTEER). Step by step: 1. Read name, email, address,
// postalCode, phone, password from the form. 2. Refuse unless locationConsent === true (location
// tracking needs consent). 3. Refuse unless this email was verified with the 6-digit code (check only;
// not used up yet). 4. Refuse a weak password (8+ chars, upper, lower, digit, special) - the browser
// check can be bypassed. 5. Hash the password with bcrypt (never store plain text). 6. Look up the
// postal code on OneMap for lat/lng; OneMap down -> 502; code not found -> 400. 7. Save the account
// with role "volunteer" and the consent time. 8. Use up the email verification (so it cannot be
// reused). 9. Reply 201 with only safe fields (id, name, email). 10. Errors: duplicate key -> 409
// "<field> already registered"; validation error -> 400; anything else -> 500.
exports.userCreate = async (req, res) => {
  try {
    const { name, email, address, postalCode, phone, password } = req.body;
    if (req.body.locationConsent !== true) {
      return res.status(400).json({ message: "Please agree to location sharing to sign up." });
    }
    if (!otp.isVerifiedEmail(email)) {
      return res
        .status(400)
        .json({ message: "Please verify your email with the 6-digit code first." });
    }
    const strong =
      typeof password === "string" && password.length >= 8 && /[A-Z]/.test(password) &&
      /[a-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9\s]/.test(password);
    if (!strong) {
      return res.status(400).json({
        message: "Password must be 8+ characters with an uppercase letter, lowercase letter, number and special character.",
      });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    let coordinates;
    try {
      coordinates = await onemap.geocodePostal(postalCode);
    } catch (oneMapError) {
      console.error("Postal geocode failed:", oneMapError.message);
      return res.status(502).json({ message: "Could not reach OneMap. Please try again in a few minutes." });
    }
    if (!coordinates) {
      return res
        .status(400)
        .json({ message: "We could not find that postal code. Please check it and try again." });
    }

    const user = await Account.create({
      name,
      email,
      address,
      postalCode,
      phone,
      password: hashedPassword,
      role: "volunteer",
      locationConsentAt: new Date(),
      lat: coordinates.lat,
      lng: coordinates.lng,
    });

    otp.useVerifiedEmail(email);

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
    });
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).json({ message: `That ${field} is already registered.` });
    }
    if (error.name === "ValidationError") {
      const message = Object.values(error.errors)[0].message;
      return res.status(400).json({ message });
    }
    res.status(500).json({ message: "Could not create account." });
  }
};

// login - starts a session. 1) both fields required, else 400. 2) find the account by email. 3)
// bcrypt-compare the password; same message for unknown email and wrong password (401) so attackers
// learn nothing. 4) regenerate the session id (prevents session fixation). 5) store userId and role in
// the session. 6) reply with id, name, email, role.
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Enter your email and password." });
    }

    const user = await Account.findByEmail(email);
    const valid = user && (await bcrypt.compare(password, user.password));

    if (!valid) {
      return res.status(401).json({ message: "Incorrect email or password." });
    }

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ message: "Login failed." });

      req.session.userId = user._id.toString();
      req.session.role = user.role;

      res.json({ _id: user._id, name: user.name, email: user.email, role: user.role });
    });
  } catch (error) {
    res.status(500).json({ message: "Login failed." });
  }
};

// logout - 1) remember the userId before the session disappears 2) destroy the session 3) close that
// user's live socket connections 4) clear the cookie 5) reply "Logged out".
exports.logout = (req, res) => {
  const userId = req.session?.userId;
  req.session.destroy(() => {
    if (userId) disconnectUser(userId);
    res.clearCookie("connect.sid");
    res.json({ message: "Logged out" });
  });
};

// me - "who am I?" after a page refresh. 1) load the account from the session's userId 2) none -> 401
// 3) otherwise reply with the account (the model hides the password).
exports.me = async (req, res) => {
  try {
    const user = await Account.findById(req.session.userId);
    if (!user) return res.status(401).json({ message: "Not logged in" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Could not load user." });
  }
};

// updateMe (PUT /api/users/me) - save which shows the volunteer can attend. Steps: 1. availableShows
// must be an array of strings, else 400. 2. Load the current account (none -> 401). 3. Refuse (409)
// any show they previously Declined/Withdrew from (that answer is final). 4. Work out the shows being
// UNTICKED and call releaseRemovedShows; if it returns a message -> 409. 5. Save the new list. 6. For
// newly TICKED shows: add the volunteer to that show's reserve list, and for already-published shows
// try to fill open places from the reserve. Failures are only logged. 7. Reply with the updated
// account.
exports.updateMe = async (req, res) => {
  try {
    const { availableShows } = req.body;
    if (!Array.isArray(availableShows) || !availableShows.every((s) => typeof s === "string")) {
      return res.status(400).json({ message: "availableShows must be an array of strings." });
    }

    const current = await Account.findById(req.session.userId);
    if (!current) return res.status(401).json({ message: "Not logged in" });

    const left = (current.withdrawnShows || []).find((w) => availableShows.includes(w.show));
    if (left) {
      const action = left.status === "Declined" ? "declined" : "withdrew from";
      return res
        .status(409)
        .json({ message: `You ${action} ${left.show}, so you cannot be available for it again.` });
    }

    const removed = (current.availableShows || []).filter((s) => !availableShows.includes(s));
    const problem = await releaseRemovedShows(req.session.userId, removed);
    if (problem) return res.status(409).json({ message: problem });

    const user = await Account.updateAvailableShows(req.session.userId, availableShows);
    if (!user) return res.status(401).json({ message: "Not logged in" });

    const added = availableShows.filter((s) => !(current.availableShows || []).includes(s));
    if (added.length > 0) {
      try {
        const published = await Assignments.publishedShows();
        await Assignments.addToReserve(req.session.userId, user.name, added, published);
        for (const show of added.filter((s) => published.includes(s))) await replaceFromReserve(show);
      } catch (reserveError) {
        console.error("Adding to the reserve list failed:", reserveError.message);
      }
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Could not update user." });
  }
};

// removeMyShows (DELETE /api/users/me) - same idea as updateMe but removes only the listed shows. 1)
// validate the array 2) keep only shows they really had ticked 3) releaseRemovedShows (may refuse with
// 409) 4) remove them 5) reply with the updated account.
exports.removeMyShows = async (req, res) => {
  try {
    const { availableShows } = req.body;
    if (!Array.isArray(availableShows) || !availableShows.every((s) => typeof s === "string")) {
      return res.status(400).json({ message: "availableShows must be an array of strings." });
    }

    const current = await Account.findById(req.session.userId);
    if (!current) return res.status(401).json({ message: "Not logged in" });
    const removed = availableShows.filter((s) => (current.availableShows || []).includes(s));
    const problem = await releaseRemovedShows(req.session.userId, removed);
    if (problem) return res.status(409).json({ message: problem });

    const user = await Account.removeAvailableShows(req.session.userId, availableShows);
    if (!user) return res.status(401).json({ message: "Not logged in" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Could not update user." });
  }
};

// volunteerLocations (admin) - home coordinates of all volunteers. 1) load volunteers 2) keep those
// with numeric lat and lng 3) reply with id, name, lat, lng, address only (no OneMap call per
// volunteer, which was too slow).
exports.volunteerLocations = async (req, res) => {
  try {
    const volunteers = await Account.retrieveVolunteers();

    const result = volunteers
      .filter((v) => typeof v.lat === "number" && typeof v.lng === "number")
      .map((v) => ({ _id: v._id, name: v.name, lat: v.lat, lng: v.lng, address: v.address }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Could not load volunteer locations." });
  }
};

// route - walking/driving directions through OneMap. 1) read start and end coordinates from the query
// 2) routeType must be walk, drive or cycle (default walk) 3) any non-number -> 400 4) ask OneMap for
// the route 5) failure -> 502.
exports.route = async (req, res) => {
  const { startLat, startLng, endLat, endLng } = req.query;
  const routeType = ["walk", "drive", "cycle"].includes(req.query.routeType)
    ? req.query.routeType
    : "walk";

  const nums = [startLat, startLng, endLat, endLng].map(Number);
  if (nums.some(Number.isNaN)) {
    return res.status(400).json({ message: "Invalid coordinates." });
  }

  try {
    res.json(await onemap.getRoute(`${startLat},${startLng}`, `${endLat},${endLng}`, routeType));
  } catch (error) {
    console.error("Routing failed:", error.message);
    res.status(502).json({ message: "Could not get a route from OneMap." });
  }
};

// postalLookup - registration form: postal code -> address. 1) trim the code 2) must be exactly 6
// digits else 400 3) ask OneMap 4) not found -> 404 5) OneMap down -> 502 6) otherwise reply {
// address, lat, lng }.
exports.postalLookup = async (req, res) => {
  const postalCode = (req.query.postalCode || "").trim();
  if (!/^\d{6}$/.test(postalCode)) {
    return res.status(400).json({ message: "Enter a 6-digit postal code." });
  }
  try {
    const place = await onemap.lookupPostal(postalCode);
    if (!place) return res.status(404).json({ message: "No address found for this postal code." });
    res.json(place);
  } catch (error) {
    console.error("Postal lookup failed:", error.message);
    res.status(502).json({ message: "Could not reach OneMap. Please try again in a few minutes." });
  }
};

// addressSearch - registration form: typed address -> up to 5 matches. 1) trim the text 2) fewer than
// 3 characters -> 400 3) ask OneMap 4) failure -> 502.
exports.addressSearch = async (req, res) => {
  const q = (req.query.q || "").trim();
  if (q.length < 3) {
    return res.status(400).json({ message: "Type at least 3 characters to search." });
  }
  try {
    res.json(await onemap.searchAddress(q));
  } catch (error) {
    console.error("Address search failed:", error.message);
    res.status(502).json({ message: "Could not reach OneMap. Please try again in a few minutes." });
  }
};

// otpRequest - emails a 6-digit code. 1) lowercase + trim the email 2) invalid format -> 400 3) email
// already registered -> 409 4) phone already registered -> 409 (checked early so they do not type a
// code for nothing) 5) ask otp.requestCode to make and send the code 6) too-soon resend -> 429, email
// failure -> 502.
exports.otpRequest = async (req, res) => {
  const email = (req.body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: "Enter a valid email address." });
  }
  try {
    if (await Account.findByEmail(email)) {
      return res.status(409).json({ message: "That email is already registered. Try logging in." });
    }
    const phone = (req.body.phone || "").replace(/\s+/g, "");
    if (phone && (await Account.findByPhone(phone))) {
      return res
        .status(409)
        .json({ message: "That phone number is already registered. Try logging in." });
    }
    const result = await otp.requestCode(email);
    res.json(result);
  } catch (error) {
    if (error.status === 429) return res.status(429).json({ message: error.message });
    console.error("OTP email failed:", error.message);
    res.status(502).json({ message: "Could not send the code email. Please try again." });
  }
};

// otpVerify - checks the typed code. 1) otp.checkCode returns "" when correct or an error text 2)
// error text -> 400 3) correct -> reply { verified: true } (the email is now remembered as verified
// for 15 minutes).
exports.otpVerify = (req, res) => {
  const { email, code } = req.body;
  const message = otp.checkCode(email, code);
  if (message) return res.status(400).json({ message });
  res.json({ verified: true });
};
