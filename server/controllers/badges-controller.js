// Badge endpoints: the badge list, a volunteer's awards, manual and automatic awarding, the saved
// design, orders and order status.

const BADGES = require("../data/badges.json");
const BadgeAward = require("../models/badge-awards-model");
const BadgeDesign = require("../models/badge-design-model");
const BadgeOrder = require("../models/badge-order-model");
const Account = require('../models/account-model')
const Assignments = require('../models/assignments-model')
const mongoose = require("mongoose");
const sendServerError = require('../utils/send-server-error')
const onemap = require('../services/onemap')
const { emit } = require("../sockets");
const SCHEDULE = require("../data/schedule.json");

// reportingMinutes(text) - turns a school reporting time such as "1:30pm" into minutes since midnight.
// 1. Lowercase it and remove spaces ("1:30 PM" -> "1:30pm"). 2. Cut off the last 2 letters (am/pm) and
// split on ":" into hour h and minute m (as numbers). 3. pm and hour < 12 -> add 12 hours; pm and hour
// = 12 -> keep 12. 4. am and hour < 12 -> keep; am and hour = 12 (12:xx am) -> only the minutes. 5.
// Return hours x 60 + minutes.
function reportingMinutes(text) {
  const clean = text.toLowerCase().replace(/\s/g, '')
  const [h, m] = clean.slice(0,-2).split(':').map(Number)
  let minutes = 0
  if (clean.endsWith('pm')) {
    if (h < 12) {
      minutes = (h + 12) * 60 + m
    } else {
      minutes = h * 60 + m
    }
  } else {
    if (h < 12) {
      minutes = h * 60 + m
    } else {
      minutes = m
    }
  }
  return minutes
}

// singaporeMinutes(date) - minutes since midnight of a Date in Singapore time: 1) print the time as
// "HH:MM" in the Asia/Singapore time zone (24-hour clock) 2) split into hour and minute 3) return hour
// x 60 + minute.
function singaporeMinutes(date) {
  const [h, m] = date.toLocaleTimeString('en-GB', { timeZone: 'Asia/Singapore', hourCycle: 'h23' }).split(':').map(Number)
  return h * 60 + m
}

// listBadges - replies with the badge catalogue (any logged-in user).
exports.listBadges = (req, res) => res.json(BADGES);

// listMyAwards - the logged-in volunteer's badges. 1) load their award rows (newest first) 2) for each
// row look up the badge details by code 3) reply with { badge, event, message } for each.
exports.listMyAwards = async (req, res) => {
  try {
    const userAwards = await BadgeAward.retrieveByVolunteer(req.session.userId);
    const myAwards = userAwards.map((award) => {
      return {
        badge: BADGES.find((b) => b.code === award.badge),
        event: award.event,
        message: award.message,
      };
    });
    res.json(myAwards);
  } catch (error) {
    sendServerError(res, error);
  }
};

// awardBadge (admin) - gives a badge to one or many volunteers. 1) volunteerIds must be a non-empty
// array, badgeCode must be a real badge, event must be a real show and every id must be a valid id
// (else 400), 2) create one award row per volunteer, 3) a duplicate (same badge, show and volunteer)
// is skipped instead of failing, 4) reply with how many were awarded and how many were skipped.
exports.awardBadge = async (req, res) => {
  try {
    const { volunteerIds, badgeCode, event, message } = req.body;
    if (!Array.isArray(volunteerIds) || volunteerIds.length === 0) {
      return res.status(400).json({ message: 'Please choose at least one volunteer.' })
    }
    if (!BADGES.some((b) => b.code === badgeCode)) {
      return res.status(400).json({ message: 'Please choose a valid badge.' })
    }
    if (!SCHEDULE.some((s) => s.name === event)) {
      return res.status(400).json({ message: 'Please choose a valid show.' })
    }
    if (!volunteerIds.every((id) => mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ message: 'One of the chosen volunteers is not valid.' })
    }
    if (message && message.length > 300) {
      return res.status(400).json({ message: 'The message can be at most 300 characters.' })
    }
    const given = [];
    const skipped = [];

    for (const volunteerId of volunteerIds) {
      try {
        const award = await BadgeAward.create({ badge: badgeCode, volunteer: volunteerId, event: event, awardedBy: req.session.userId, message: message });
        given.push(award);
      } catch (error) {
        if (error.code === 11000) skipped.push(volunteerId);
        else throw error;
      }
    }

    for (const award of given) emit("badges:updated", null, `user:${award.volunteer}`);
    res.status(201).json({ given, skipped });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// saveMyDesign (volunteer) - saves the badge design. 1) load the volunteer's existing design 2) locked
// -> 409 (already ordered) 3) read shape, colours, emblem, ribbonText 4) no design yet -> create one
// (201) 5) otherwise overwrite its fields and save (200) 6) schema rules reject bad values with 400.
exports.saveMyDesign = async (req, res) => {
  try {
    const design = await BadgeDesign.findByVolunteer(req.session.userId)
    if (design?.locked === true) {
      return res.status(409).json({ message: 'Design is locked.' }) }
    const {shape, primaryColor, secondaryColor, emblem, ribbonText } = req.body
    if (!design) {
      const saved = await BadgeDesign.create({ volunteer: req.session.userId, shape, primaryColor, secondaryColor, emblem, ribbonText, locked: false})
      res.status(201).json(saved)
    } else {
      design.shape = shape
      design.primaryColor = primaryColor
      design.secondaryColor = secondaryColor
      design.emblem = emblem
      design.ribbonText = ribbonText
      await design.save()
      res.status(200).json(design) }
  } catch (error) {
     res.status(400).json({ message: error.message })
  }
}

// placeOrder (volunteer) - orders the saved badge. 1) the postal code must be 6 digits and the unit 1
// to 20 characters (else 400), 2) load their design (none: 400 "save your design first"), 3) a design
// that is already locked gives 409, 4) look up the address for the postal code from OneMap and use
// that address (not the typed one), 5) create the order and lock the design, 6) reply with the new
// order; if something fails after locking, the lock is undone.
exports.placeOrder = async (req, res) => {
  let lockedByMe = false
  try {
    const { address } = req.body
    const postalCode = String(address?.postalCode ?? '').trim()
    const unit = String(address?.unit ?? '').trim()

    if (!/^\d{6}$/.test(postalCode)) {
      return res.status(400).json({ message: 'Enter a 6-digit postal code.' })
    }
    if (!unit || unit.length > 20) {
      return res.status(400).json({ message: 'Enter your unit number (up to 20 characters).' })
    }

    let place
    try {
      place = await onemap.lookupPostal(postalCode)
    } catch (oneMapError) {
      console.error('Badge order postal lookup failed:', oneMapError.message)
      return res.status(502).json({ message: 'Could not verify your address right now. Please try again in a few minutes.' })
    }
    if (!place) {
      return res.status(400).json({ message: 'We could not find that postal code. Please check it and try again.' })
    }

    const design = await BadgeDesign.lockIfUnlocked(req.session.userId)
    if (!design) {
      const existing = await BadgeDesign.findByVolunteer(req.session.userId)
      if (!existing) {
        return res.status(400).json({ message: 'Please save your design before ordering.' })
      }
      return res.status(409).json({ message: 'You have already ordered your badge.' })
    }
    lockedByMe = true

    const order = await BadgeOrder.create(
      {
          volunteer: req.session.userId,
          designSnapshot: {
              shape:          design.shape,
              primaryColor:   design.primaryColor,
              secondaryColor: design.secondaryColor,
              emblem:         design.emblem,
              ribbonText:     design.ribbonText,
          },
          address: {
              line1:      place.address,
              unit,
              postalCode,
          },
        })
    emit("orders:updated", null, "hq")
    res.status(201).json(order)
  } catch (error) {
    if (lockedByMe) await BadgeDesign.unlock(req.session.userId)
    res.status(400).json({ message: error.message })
  }
}

// getMyDesign - replies with the volunteer's saved design (null if none).
exports.getMyDesign = async (req, res) => {
  try {
    const design = await BadgeDesign.findByVolunteer(req.session.userId)
    res.status(200).json(design)
  } catch (error) {
    sendServerError(res, error)
  }
}

// listMyOrders - replies with the volunteer's own orders, newest first.
exports.listMyOrders = async (req, res) => {
  try {
    const orders = await BadgeOrder.findByVolunteer(req.session.userId)
    res.status(200).json(orders)
  } catch (error) {
    sendServerError(res, error)
  }
}

// listAllOrders (admin) - every order with the volunteer's name and email.
exports.listAllOrders = async (req, res) => {
  try {
    const orders = await BadgeOrder.findAll()
    res.status(200).json(orders)
  } catch (error) {
    sendServerError(res, error)
  }
}

// updateOrderStatus (admin) - moves an order forward one step. 1) load the order (none -> 404) 2)
// already delivered -> 409 3) the new status must be exactly the next one in placed -> in_production
// -> shipped -> delivered (else 409 telling the allowed next status) 4) save and reply. An invalid id
// gives 400.
exports.updateOrderStatus = async (req, res) => {
  try {
    const newStatus = req.body.status
    const order = await BadgeOrder.findById(req.params.id)
    if (!order) {
      return res.status(404).json({ message: 'Cannot find order.' })
    }
    const current = BadgeOrder.STATUS_LIST.indexOf(order.status)
    if (order.status === 'delivered') {
      return res.status(409).json({ message: 'Order is already delivered'})
    }
    if (BadgeOrder.STATUS_LIST.indexOf(newStatus) !== current + 1) {
      return res.status(409).json({ message: 'Current status ' + order.status + ' can only be changed to ' + BadgeOrder.STATUS_LIST[current + 1]})
    }

    order.status = newStatus
    await order.save()
    emit("orders:updated", null, "hq")
    emit("orders:updated", null, `user:${order.volunteer}`)
    res.status(200).json(order)
  } catch (error) {
    if (error.name === 'CastError'){
      res.status(400).json({ message: 'That order ID is invalid.'})
    } else {
    sendServerError(res, error)
    }
  }
}

// listVolunteers (admin) - volunteer names + emails A to Z, for the award form's search box.
exports.listVolunteers = async (req, res) => {
  try {
    const volunteers = await Account.retrieveVolunteerNames()
    res.status(200).json(volunteers)
  } catch (error) {
    sendServerError(res, error)
  }
}

// autoAward (admin) - hands out the automatic badges for one show. Steps: 1. The chosen show must be a
// known show (400 otherwise). 2. FULL_ROUTE winners = accepted volunteers who clocked all 8
// checkpoints. 3. EARLY_BIRD winners = volunteers whose first checkpoint was at least 30 minutes
// before the school's reporting time (schools without a reporting time are skipped). 4. SUPER_SUB
// winners = volunteers filled in from the reserve list who started the journey. 5. Create one award
// per winner; a duplicate is counted in "skipped" (so pressing the button twice is safe). 6. Reply
// with how many of each badge were given and the skipped count.
exports.autoAward = async (req, res) => {
  try {
    const { event } = req.body
    if (!Assignments.SHOWS.includes(event)) {
      return res.status(400).json({ message: 'Please choose a show.' })
    }

    const fullRoute = await Assignments.findFullRoute(event)
    const EARLY_MINUTES = 30

    const arrivals = await Assignments.findArrivals(event)
    const earlyBirds = arrivals.filter(assignment => {
      const reached = assignment.stageHistory.find(a => a.stage === 1)
      return reached && assignment.school && assignment.school.reportingTime && (reportingMinutes (assignment.school.reportingTime) - singaporeMinutes(reached.at) >= EARLY_MINUTES)
    })

    const superSubs = await Assignments.findSuperSubs(event)

    const winners = {
      FULL_ROUTE: fullRoute.map(assignment => assignment.volunteer),
      EARLY_BIRD: earlyBirds.map(a => a.volunteer),
      SUPER_SUB: superSubs.map(s => s.volunteer),
    }

    const given = { FULL_ROUTE: 0, EARLY_BIRD: 0, SUPER_SUB: 0 }
    let skipped = 0
    const awarded = new Set()

    for (const code of Object.keys(winners)) {
      for (const volunteerId of winners[code]) {
        try {
          await BadgeAward.create({ badge: code, volunteer: volunteerId, event, awardedBy: req.session.userId })
          given[code] += 1
          awarded.add(String(volunteerId))
        } catch (error) {
          if (error.code === 11000) skipped += 1
          else throw error
        }
      }
    }

    for (const id of awarded) emit("badges:updated", null, `user:${id}`)
    res.status(200).json({ given, skipped })
  } catch (error) {
    sendServerError(res, error)
  }
}