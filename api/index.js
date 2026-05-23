const serverless = require('serverless-http');

let handler;

module.exports = async (req, res) => {
  try {
    if (!handler) {
      const app = require('../server');
      handler = serverless(app);
    }
    return handler(req, res);
  } catch (err) {
    console.error('Handler init error:', err);
    res.status(500).json({
      error: 'Server initialization failed',
      message: err.message
    });
  }
};
