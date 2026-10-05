// 404 for unknown /api routes
function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` })
}

// Catches any error thrown in a route/controller (Express 5 passes async errors here too)
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err)
  const status = err.status || 500
  res.status(status).json({ message: err.message || 'Something went wrong' })
}

module.exports = { notFound, errorHandler }
