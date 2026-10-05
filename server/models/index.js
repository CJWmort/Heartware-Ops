// Import every model from one place:  const { User, Slot } = require('../models')
module.exports = {
  User: require('./user-model'),
  Volunteer: require('./volunteer-model'),
  School: require('./school-model'),
  Event: require('./event-model'),
  Slot: require('./slot-model'),
  Replacement: require('./replacement-model'),
  Swap: require('./swap-model'),
  AuditLog: require('./audit-log-model'),
  CheckIn: require('./check-in-model'),
  LocationPing: require('./location-ping-model'),
  Incident: require('./incident-model'),
  Alert: require('./alert-model'),
  Badge: require('./badge-model'),
  BadgeAward: require('./badge-award-model'),
  BadgeDesign: require('./badge-design-model'),
  BadgeOrder: require('./badge-order-model'),
}
