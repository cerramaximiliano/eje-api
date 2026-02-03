const jwt = require('jsonwebtoken');
const { logger } = require('../config/pino');

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

    logger.debug({
      userId: req.userId,
      path: req.path,
      method: req.method,
      timestamp: getArgentinaDate().toISOString()
    }, 'Token verified');

    next();
  } catch (error) {
    logger.error({ error: error.message, path: req.path }, 'Token verification failed');
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
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
    // Import User model dynamically to avoid circular dependencies
    const mongoose = require('mongoose');
    const User = mongoose.model('User');

    const user = await User.findById(req.userId);

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
    logger.error({ error: error.message, userId: req.userId }, 'Admin verification failed');
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

    logger.debug({
      path: req.path,
      method: req.method,
      timestamp: getArgentinaDate().toISOString()
    }, 'API key verified');

    next();
  } catch (error) {
    logger.error({ error: error.message, path: req.path }, 'API key verification failed');
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
    logger.debug({ path: req.path, method: req.method }, 'Authenticated via API key');
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
