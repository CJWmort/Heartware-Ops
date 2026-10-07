// Placeholder used by controller stubs. Replace each use with real logic.
function notImplemented(name) {
  return (req, res) => {
    res.status(501).json({ message: `${name} is not implemented yet` })
  }
}

module.exports = notImplemented
