module.exports = (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'Lexis AI Dictionary',
    timestamp: new Date().toISOString()
  });
};
