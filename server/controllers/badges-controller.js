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
