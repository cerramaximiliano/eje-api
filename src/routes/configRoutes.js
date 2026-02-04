const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdmin, verifyApiKey, verifyTokenOrApiKey } = require('../middleware/auth');
const controller = require('../controllers/configController');

// ========== WORKER CONFIGURATION ==========

// Get config (JWT or API key - workers need this)
router.get('/', verifyTokenOrApiKey, controller.getConfig);

// Update config (Admin only)
router.patch('/', verifyToken, verifyAdmin, controller.updateConfig);

// Toggle enabled state (Admin only)
router.post('/toggle', verifyToken, verifyAdmin, controller.toggleEnabled);

// ========== MANAGER CONFIGURATION ==========

// Get manager config (JWT or API key)
router.get('/manager', verifyTokenOrApiKey, controller.getManagerConfig);

// Get full manager config with history (Admin only)
router.get('/manager/full', verifyToken, verifyAdmin, controller.getManagerConfigFull);

// Update manager config (Admin only)
router.patch('/manager', verifyToken, verifyAdmin, controller.updateManagerConfig);

// Toggle manager running state (Admin only)
router.post('/manager/toggle', verifyToken, verifyAdmin, controller.toggleManager);

// Pause/resume manager (Admin only)
router.post('/manager/pause', verifyToken, verifyAdmin, controller.pauseManager);

// Get manager history (Admin only)
router.get('/manager/history', verifyToken, verifyAdmin, controller.getManagerHistory);

// Get alerts (Admin only)
router.get('/manager/alerts', verifyToken, verifyAdmin, controller.getAlerts);

// Acknowledge alert (Admin only)
router.post('/manager/alerts/:index/acknowledge', verifyToken, verifyAdmin, controller.acknowledgeAlert);

// Get daily stats (Admin only)
router.get('/manager/daily-stats', verifyToken, verifyAdmin, controller.getDailyStats);

// ========== INDIVIDUAL WORKER MANAGEMENT ==========

// Get all workers config and status (Admin only)
router.get('/manager/workers', verifyToken, verifyAdmin, controller.getAllWorkersConfig);

// Update global manager settings (Admin only)
router.patch('/manager/settings', verifyToken, verifyAdmin, controller.updateGlobalSettings);

// Get specific worker config (Admin only)
router.get('/manager/worker/:workerType', verifyToken, verifyAdmin, controller.getWorkerConfig);

// Update specific worker config (Admin only)
router.patch('/manager/worker/:workerType', verifyToken, verifyAdmin, controller.updateWorkerConfig);

// Toggle specific worker (Admin only)
router.post('/manager/worker/:workerType/toggle', verifyToken, verifyAdmin, controller.toggleWorker);

// ========== WORKER STATS ==========

// Get worker stats (JWT or API key)
router.get('/worker-stats', verifyTokenOrApiKey, controller.getWorkerStats);

// Get today's summary (JWT or API key)
router.get('/worker-stats/today', verifyTokenOrApiKey, controller.getTodaySummary);

// Get run history for specific worker (Admin only)
router.get('/worker-stats/:workerType/:workerId/runs', verifyToken, verifyAdmin, controller.getRunHistory);

module.exports = router;
