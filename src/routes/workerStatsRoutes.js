const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdmin, verifyApiKey, verifyTokenOrApiKey } = require('../middleware/auth');
const controller = require('../controllers/workerStatsController');

// Stats (JWT or API key)
router.get('/', verifyTokenOrApiKey, controller.getStats);
router.get('/activity', verifyTokenOrApiKey, controller.getRecentActivity);
router.get('/eligibility', verifyTokenOrApiKey, controller.getEligibilityStats);

// Admin routes
router.get('/errors', verifyToken, verifyAdmin, controller.getErrorDocuments);
router.get('/stuck', verifyToken, verifyAdmin, controller.getStuckDocuments);
router.post('/clear-stuck', verifyToken, verifyAdmin, controller.clearStuckLocks);
router.post('/reset-error/:id', verifyToken, verifyAdmin, controller.resetErrorCount);

module.exports = router;
