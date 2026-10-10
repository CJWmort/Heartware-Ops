const BADGES = require("../data/badges.json");
const BadgeAward = require("../models/badge-awards-model"); 

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