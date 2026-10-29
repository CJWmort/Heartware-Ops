module.exports = function sendServerError(res, error) {
  console.error(error)
  res.status(500).json({ message: 'Something went wrong. Please try again.' })
}
