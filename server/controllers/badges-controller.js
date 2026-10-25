const BADGES = require("../data/badges.json");
const BadgeAward = require("../models/badge-awards-model"); 
const BadgeDesign = require("../models/badge-design-model");
const BadgeOrder = require("../models/badge-order-model");
const Account = require('../models/account-model')
const Assignments = require('../models/assignments-model')


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
    res.status(500).json({ message: error.message });
  }
};

exports.awardBadge = async (req, res) => {
  try {
    const { volunteerIds, badgeCode, event, message } = req.body;  
    if (!Array.isArray(volunteerIds) || volunteerIds.length === 0) {
      return res.status(400).json({ message: 'Please choose at least one volunteer.' })
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
  try {
    const design = await BadgeDesign.findByVolunteer(req.session.userId)
    if (!design) {
      return res.status(400).json({ message: 'Please save your design before ordering.' })}
    if (design?.locked === true) {
      return res.status(409).json({ message: 'You have already ordered your badge.' }) }
    const { address } = req.body
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
              line1:      address?.line1,
              unit:       address?.unit,
              postalCode: address?.postalCode,
          },
        })
      design.locked = true
      await design.save()
      res.status(201).json(order)
  } catch (error) {
     res.status(400).json({ message: error.message })
  }
}

exports.getMyDesign = async (req, res) => {
  try {
    const design = await BadgeDesign.findByVolunteer(req.session.userId)
    res.status(200).json(design)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

exports.listMyOrders = async (req, res) => {
  try {
    const orders = await BadgeOrder.findByVolunteer(req.session.userId)
    res.status(200).json(orders)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

exports.listAllOrders = async (req, res) => {
  try {
    const orders = await BadgeOrder.findAll()
    res.status(200).json(orders)
  } catch (error) {
    res.status(500).json({ message: error.message })
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
    res.status(500).json({ message: error.message })
    }
  }
}

exports.listVolunteers = async (req, res) => {
  try {
    const volunteers = await Account.retrieveVolunteerNames()
    res.status(200).json(volunteers)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

exports.autoAward = async (req, res) => {
  try {
    const { event } = req.body
    if (!Assignments.SHOWS.includes(event)) {
      return res.status(400).json({ message: 'Please choose a show.' })
    }

    // Who qualifies for each rule, as lists of volunteer ids
    const fullRoute = await Assignments.findFullRoute(event)

    const winners = {
      FULL_ROUTE: fullRoute.map(assignment => assignment.volunteer), // assignments → just the volunteer ids
      EARLY_BIRD: [], // step 3
      SUPER_SUB: [], // step 4 (needs the fromReserve marker first)
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

    // 200, not 201: a run can give zero badges and still be a success
    res.status(200).json({ given, skipped })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}