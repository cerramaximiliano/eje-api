const jwt = require('jsonwebtoken');
const { logger } = require('../config/pino');
const User = require('../models/user');

/**
 * Get current date in Argentina timezone (UTC-3)
 */
function getArgentinaDate() {
  const now = new Date();
  const argentinaOffset = -3 * 60;
  const utcOffset = now.getTimezoneOffset();
  const argentinaTime = new Date(now.getTime() + (utcOffset + argentinaOffset) * 60000);
  return argentinaTime;
}

/**
 * Verify JWT token from cookie, header, or query param
 */
const verifyToken = (req, res, next) => {
  try {
    // Get token from multiple sources
    let token = req.cookies?.auth_token;

    if (!token && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No authentication token provided'
      });
    }

    const secret = process.env.JWT_SECRET || process.env.SEED;
    const decoded = jwt.verify(token, secret);

    // Check token expiration
    const currentTime = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < currentTime) {
      return res.status(401).json({
        success: false,
        message: 'Token has expired'
      });
    }

    req.userId = decoded.userId || decoded._id || decoded.id;
    req.userData = decoded;

    logger.debug('Token verified for user ' + req.userId + ' on ' + req.method + ' ' + req.path);

    next();
  } catch (error) {
    logger.error('Token verification failed on ' + req.path + ': ' + error.message);
    return res.status(401).json({
      success: false,
      message: 'Token verification failed',
      error: error.message
    });
  }
};

/**
 * Verify admin role
 * Must be used after verifyToken
 */
const verifyAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select('role');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.role !== 'ADMIN_ROLE') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Admin verification failed for user ' + req.userId + ': ' + error.message);
    return res.status(500).json({
      success: false,
      message: 'Error verifying admin status',
      error: error.message
    });
  }
};

/**
 * Verify API key from header, query param, or body
 */
const verifyApiKey = (req, res, next) => {
  try {
    // Get API key from multiple sources
    let apiKey = req.headers['x-api-key'] || req.headers['api-key'];

    if (!apiKey && req.query.apiKey) {
      apiKey = req.query.apiKey;
    }

    if (!apiKey && req.body?.apiKey) {
      apiKey = req.body.apiKey;
    }

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key not provided'
      });
    }

    if (apiKey !== process.env.API_KEY) {
      return res.status(401).json({
        success: false,
        message: 'Invalid API key'
      });
    }

    logger.debug('API key verified on ' + req.method + ' ' + req.path);

    next();
  } catch (error) {
    logger.error('API key verification failed on ' + req.path + ': ' + error.message);
    return res.status(500).json({
      success: false,
      message: 'Error verifying API key',
      error: error.message
    });
  }
};

/**
 * Allow either JWT token OR API key
 */
const verifyTokenOrApiKey = (req, res, next) => {
  // Check for API key first
  const apiKey = req.headers['x-api-key'] || req.headers['api-key'] || req.query.apiKey || req.body?.apiKey;

  if (apiKey && apiKey === process.env.API_KEY) {
    logger.debug('Authenticated via API key on ' + req.method + ' ' + req.path);
    return next();
  }

  // Fall back to JWT token
  verifyToken(req, res, next);
};

module.exports = {
  verifyToken,
  verifyAdmin,
  verifyApiKey,
  verifyTokenOrApiKey,
  getArgentinaDate
};
