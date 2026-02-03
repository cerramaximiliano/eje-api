const express = require('express');
const router = express.Router();

// Import routes
const causasEjeRoutes = require('./causasEjeRoutes');
const causasEjeServiceRoutes = require('./causasEjeServiceRoutes');
const workerStatsRoutes = require('./workerStatsRoutes');

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'EJE API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Mount routes
router.use('/causas-eje', causasEjeRoutes);
router.use('/causas-eje-service', causasEjeServiceRoutes);
router.use('/worker-stats', workerStatsRoutes);

module.exports = router;
