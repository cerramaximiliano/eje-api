const { ConfiguracionEje, ManagerConfigEje, WorkerStatsEje } = require('eje-models');
const { logger } = require('../config/pino');

// ========== CONFIGURACION EJE ==========

/**
 * Get current worker configuration
 * GET /config
 */
const getConfig = async (req, res) => {
  try {
    const config = await ConfiguracionEje.getOrCreate();

    return res.json({
      success: true,
      data: config
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error getting config');
    return res.status(500).json({
      success: false,
      message: 'Error getting configuration',
      error: error.message
    });
  }
};

/**
 * Update worker configuration
 * PATCH /config
 */
const updateConfig = async (req, res) => {
  try {
    const allowedFields = [
      'enabled',
      'workerCount',
      'batchSize',
      'delayBetweenRequests',
      'delayBetweenBatches',
      'maxErrorsBeforeStop',
      'schedule.enabled',
      'schedule.startHour',
      'schedule.endHour',
      'schedule.workDays',
      'schedule.timezone',
      'rateLimit.maxRequestsPerMinute',
      'rateLimit.maxRequestsPerHour'
    ];

    const updates = {};
    for (const field of allowedFields) {
      const value = getNestedValue(req.body, field);
      if (value !== undefined) {
        updates[field] = value;
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }

    const config = await ConfiguracionEje.findOneAndUpdate(
      { name: 'default' },
      { $set: updates },
      { new: true, upsert: true }
    );

    logger.info({ updates }, 'Configuration updated');

    return res.json({
      success: true,
      message: 'Configuration updated',
      data: config
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error updating config');
    return res.status(500).json({
      success: false,
      message: 'Error updating configuration',
      error: error.message
    });
  }
};

/**
 * Toggle worker enabled state
 * POST /config/toggle
 */
const toggleEnabled = async (req, res) => {
  try {
    const config = await ConfiguracionEje.getOrCreate();
    const newState = !config.enabled;

    await ConfiguracionEje.findOneAndUpdate(
      { name: 'default' },
      { $set: { enabled: newState } }
    );

    logger.info({ enabled: newState }, 'Worker enabled state toggled');

    return res.json({
      success: true,
      message: `Workers ${newState ? 'enabled' : 'disabled'}`,
      enabled: newState
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error toggling worker state');
    return res.status(500).json({
      success: false,
      message: 'Error toggling state',
      error: error.message
    });
  }
};

// ========== MANAGER CONFIG EJE ==========

/**
 * Get manager configuration and state
 * GET /config/manager
 */
const getManagerConfig = async (req, res) => {
  try {
    const config = await ManagerConfigEje.getOrCreate();

    return res.json({
      success: true,
      data: {
        config: config.config,
        currentState: config.currentState,
        alerts: config.alerts.filter(a => !a.acknowledged).slice(-10),
        dailyStats: config.dailyStats.slice(-7)
      }
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error getting manager config');
    return res.status(500).json({
      success: false,
      message: 'Error getting manager configuration',
      error: error.message
    });
  }
};

/**
 * Get full manager configuration with history
 * GET /config/manager/full
 */
const getManagerConfigFull = async (req, res) => {
  try {
    const config = await ManagerConfigEje.getOrCreate();

    return res.json({
      success: true,
      data: config
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error getting full manager config');
    return res.status(500).json({
      success: false,
      message: 'Error getting manager configuration',
      error: error.message
    });
  }
};

/**
 * Update manager settings
 * PATCH /config/manager
 */
const updateManagerConfig = async (req, res) => {
  try {
    const allowedFields = [
      'checkInterval',
      'lockTimeoutMinutes',
      'maxWorkers',
      'minWorkers',
      'scaleUpThreshold',
      'scaleDownThreshold',
      'updateThresholdHours',
      'cpuThreshold',
      'memoryThreshold',
      'workStartHour',
      'workEndHour',
      'workDays',
      'timezone',
      'workerNames.verification',
      'workerNames.update',
      'workerNames.stuck'
    ];

    const updates = {};
    for (const field of allowedFields) {
      const value = getNestedValue(req.body, field);
      if (value !== undefined) {
        updates[field] = value;
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }

    const config = await ManagerConfigEje.updateConfig(updates);

    logger.info({ updates }, 'Manager configuration updated');

    return res.json({
      success: true,
      message: 'Manager configuration updated',
      data: config?.config
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error updating manager config');
    return res.status(500).json({
      success: false,
      message: 'Error updating manager configuration',
      error: error.message
    });
  }
};

/**
 * Toggle manager running state
 * POST /config/manager/toggle
 */
const toggleManager = async (req, res) => {
  try {
    const config = await ManagerConfigEje.getOrCreate();
    const newState = !config.currentState.isRunning;

    await ManagerConfigEje.updateState({ isRunning: newState });

    logger.info({ isRunning: newState }, 'Manager state toggled');

    return res.json({
      success: true,
      message: `Manager ${newState ? 'started' : 'stopped'}`,
      isRunning: newState
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error toggling manager');
    return res.status(500).json({
      success: false,
      message: 'Error toggling manager',
      error: error.message
    });
  }
};

/**
 * Pause/resume manager
 * POST /config/manager/pause
 */
const pauseManager = async (req, res) => {
  try {
    const config = await ManagerConfigEje.getOrCreate();
    const newState = !config.currentState.isPaused;

    await ManagerConfigEje.updateState({ isPaused: newState });

    logger.info({ isPaused: newState }, 'Manager pause state changed');

    return res.json({
      success: true,
      message: `Manager ${newState ? 'paused' : 'resumed'}`,
      isPaused: newState
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error pausing manager');
    return res.status(500).json({
      success: false,
      message: 'Error pausing manager',
      error: error.message
    });
  }
};

/**
 * Get manager history
 * GET /config/manager/history
 */
const getManagerHistory = async (req, res) => {
  try {
    const hours = parseInt(req.query.hours, 10) || 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const config = await ManagerConfigEje.findOne({ name: 'eje-manager' })
      .select('history')
      .lean();

    if (!config) {
      return res.json({
        success: true,
        data: []
      });
    }

    const history = config.history.filter(h => new Date(h.timestamp) >= since);

    return res.json({
      success: true,
      data: history,
      period: `last ${hours} hours`,
      count: history.length
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error getting manager history');
    return res.status(500).json({
      success: false,
      message: 'Error getting history',
      error: error.message
    });
  }
};

/**
 * Get alerts
 * GET /config/manager/alerts
 */
const getAlerts = async (req, res) => {
  try {
    const acknowledged = req.query.acknowledged === 'true';

    const config = await ManagerConfigEje.findOne({ name: 'eje-manager' })
      .select('alerts')
      .lean();

    if (!config) {
      return res.json({
        success: true,
        data: []
      });
    }

    let alerts = config.alerts;
    if (!acknowledged) {
      alerts = alerts.filter(a => !a.acknowledged);
    }

    return res.json({
      success: true,
      data: alerts.slice(-50),
      total: alerts.length
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error getting alerts');
    return res.status(500).json({
      success: false,
      message: 'Error getting alerts',
      error: error.message
    });
  }
};

/**
 * Acknowledge alert
 * POST /config/manager/alerts/:index/acknowledge
 */
const acknowledgeAlert = async (req, res) => {
  try {
    const index = parseInt(req.params.index, 10);
    const acknowledgedBy = req.userData?.email || req.userId || 'admin';

    await ManagerConfigEje.acknowledgeAlert(index, acknowledgedBy);

    logger.info({ index, acknowledgedBy }, 'Alert acknowledged');

    return res.json({
      success: true,
      message: 'Alert acknowledged'
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error acknowledging alert');
    return res.status(500).json({
      success: false,
      message: 'Error acknowledging alert',
      error: error.message
    });
  }
};

/**
 * Get daily stats
 * GET /config/manager/daily-stats
 */
const getDailyStats = async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 30;

    const config = await ManagerConfigEje.findOne({ name: 'eje-manager' })
      .select('dailyStats')
      .lean();

    if (!config) {
      return res.json({
        success: true,
        data: []
      });
    }

    return res.json({
      success: true,
      data: config.dailyStats.slice(-days)
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error getting daily stats');
    return res.status(500).json({
      success: false,
      message: 'Error getting daily stats',
      error: error.message
    });
  }
};

// ========== WORKER STATS EJE ==========

/**
 * Get worker detailed stats
 * GET /config/worker-stats
 */
const getWorkerStats = async (req, res) => {
  try {
    const { workerType } = req.query;

    const query = {};
    if (workerType && ['verification', 'update', 'stuck'].includes(workerType)) {
      query.workerType = workerType;
    }

    const stats = await WorkerStatsEje.find(query).lean();

    return res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error getting worker stats');
    return res.status(500).json({
      success: false,
      message: 'Error getting worker stats',
      error: error.message
    });
  }
};

/**
 * Get today's summary
 * GET /config/worker-stats/today
 */
const getTodaySummary = async (req, res) => {
  try {
    const { workerType } = req.query;

    const summary = await WorkerStatsEje.getTodaySummary(workerType);

    return res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error getting today summary');
    return res.status(500).json({
      success: false,
      message: 'Error getting summary',
      error: error.message
    });
  }
};

/**
 * Get run history for a worker
 * GET /config/worker-stats/:workerType/:workerId/runs
 */
const getRunHistory = async (req, res) => {
  try {
    const { workerType, workerId } = req.params;
    const limit = parseInt(req.query.limit, 10) || 20;

    const stats = await WorkerStatsEje.findOne({ workerType, workerId })
      .select('runHistory currentRun')
      .lean();

    if (!stats) {
      return res.json({
        success: true,
        data: {
          currentRun: null,
          runHistory: []
        }
      });
    }

    return res.json({
      success: true,
      data: {
        currentRun: stats.currentRun,
        runHistory: stats.runHistory.slice(-limit).reverse()
      }
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error getting run history');
    return res.status(500).json({
      success: false,
      message: 'Error getting run history',
      error: error.message
    });
  }
};

// ========== HELPER FUNCTIONS ==========

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

module.exports = {
  // Worker config
  getConfig,
  updateConfig,
  toggleEnabled,
  // Manager config
  getManagerConfig,
  getManagerConfigFull,
  updateManagerConfig,
  toggleManager,
  pauseManager,
  getManagerHistory,
  getAlerts,
  acknowledgeAlert,
  getDailyStats,
  // Worker stats
  getWorkerStats,
  getTodaySummary,
  getRunHistory
};
