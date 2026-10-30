const BADGES = require("../data/badges.json");
const BadgeAward = require("../models/badge-awards-model"); 
const BadgeDesign = require("../models/badge-design-model");
const BadgeOrder = require("../models/badge-order-model");
const Account = require('../models/account-model')
const Assignments = require('../models/assignments-model')
const mongoose = require("mongoose");
const sendServerError = require('../utils/send-server-error')
const onemap = require('../services/onemap') // existing OneMap helper (the same file registration uses)
const SCHEDULE = require("../data/schedule.json");

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

function singaporeMinutes(date) {
  const [h, m] = date.toLocaleTimeString('en-GB', { timeZone: 'Asia/Singapore', hourCycle: 'h23' }).split(':').map(Number)
  return h * 60 + m
}

exports.listBadges = (req, res) => res.json(BADGES);

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

    res.status(201).json({ given, skipped });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

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

exports.placeOrder = async (req, res) => {
  let lockedByMe = false // true once THIS request has locked the design (so only we undo it on failure)
  try {
    const { address } = req.body // moved up: we need it BEFORE locking the design
    const postalCode = String(address?.postalCode ?? '').trim() // String() so a non-text value cannot crash .trim()
    const unit = String(address?.unit ?? '').trim() // free text on purpose: "#01-234", "38" or "38A" (landed homes) are all fine

    // The browser checks can be bypassed, so the server checks everything again.
    // All checks run BEFORE the lock, so a bad address never locks the volunteer's design.
    if (!/^\d{6}$/.test(postalCode)) {
      return res.status(400).json({ message: 'Enter a 6-digit postal code.' })
    }
    if (!unit || unit.length > 20) {
      // unit number is required (no strict format), but keep it a sensible length
      return res.status(400).json({ message: 'Enter your unit number (up to 20 characters).' })
    }

    let place // { address, lat, lng } from OneMap
    try {
      place = await onemap.lookupPostal(postalCode) // the geocoding check
    } catch (oneMapError) {
      console.error('Badge order postal lookup failed:', oneMapError.message)
      // OneMap is down, so we cannot tell if the address is real: do not accept the order
      return res.status(502).json({ message: 'Could not verify your address right now. Please try again in a few minutes.' })
    }
    if (!place) {
      // null = OneMap has no such postal code
      return res.status(400).json({ message: 'We could not find that postal code. Please check it and try again.' })
    }

    // FIX (S2): lock FIRST, atomically. Only one of several simultaneous requests (e.g. a double tap) gets a design back.
    const design = await BadgeDesign.lockIfUnlocked(req.session.userId)
    if (!design) {
      // Nothing was locked: either no design exists yet, or it was already locked (ordered / double tap)
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
              line1:      place.address, // OneMap's official address, NOT what the browser sent, so it cannot be faked
              unit,                      // already trimmed, required and length-checked above
              postalCode,                // already checked as 6 digits and confirmed by OneMap
          },
        })
    // (the design is already locked above, so there is no separate lock step here any more)
    res.status(201).json(order)
  } catch (error) {
    // The order failed (e.g. invalid address), so give the design back to the volunteer to fix and retry
    if (lockedByMe) await BadgeDesign.unlock(req.session.userId)
    res.status(400).json({ message: error.message })
  }
}

exports.getMyDesign = async (req, res) => {
  try {
    const design = await BadgeDesign.findByVolunteer(req.session.userId)
    res.status(200).json(design)
  } catch (error) {
    sendServerError(res, error)
  }
}

exports.listMyOrders = async (req, res) => {
  try {
    const orders = await BadgeOrder.findByVolunteer(req.session.userId)
    res.status(200).json(orders)
  } catch (error) {
    sendServerError(res, error)
  }
}

exports.listAllOrders = async (req, res) => {
  try {
    const orders = await BadgeOrder.findAll()
    res.status(200).json(orders)
  } catch (error) {
    sendServerError(res, error)
  }
}

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
    res.status(200).json(order)
  } catch (error) {
    if (error.name === 'CastError'){
      res.status(400).json({ message: 'That order ID is invalid.'})
    } else {
    sendServerError(res, error)
    }
  }
}

exports.listVolunteers = async (req, res) => {
  try {
    const volunteers = await Account.retrieveVolunteerNames()
    res.status(200).json(volunteers)
  } catch (error) {
    sendServerError(res, error)
  }
}

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
      return reached && assignment.school && assignment.school.reportingTime && (reportingMinutes /* FIX: skip schools with no reportingTime instead of crashing the whole run */(assignment.school.reportingTime) - singaporeMinutes(reached.at) >= EARLY_MINUTES) 
    })

    const superSubs = await Assignments.findSuperSubs(event)

    const winners = {
      FULL_ROUTE: fullRoute.map(assignment => assignment.volunteer), 
      EARLY_BIRD: earlyBirds.map(a => a.volunteer), 
      SUPER_SUB: superSubs.map(s => s.volunteer), 
    }

    const given = { FULL_ROUTE: 0, EARLY_BIRD: 0, SUPER_SUB: 0 }
    let skipped = 0

    for (const code of Object.keys(winners)) {   
      for (const volunteerId of winners[code]) {
        try {
          await BadgeAward.create({ badge: code, volunteer: volunteerId, event, awardedBy: req.session.userId }) // which badge, who, which show, given by whom?
          given[code] += 1 
        } catch (error) {
          if (error.code === 11000) skipped += 1
          else throw error
        }
      }
    }

    res.status(200).json({ given, skipped })
  } catch (error) {
    sendServerError(res, error)
  }
}