// Helper that logs an error and sends a friendly 500 reply.

// sendServerError(res, error) - logs the error and replies with a friendly 500 message so controllers
// do not repeat this code.
module.exports = function sendServerError(res, error) {
  console.error(error)
  res.status(500).json({ message: 'Something went wrong. Please try again.' })
}
