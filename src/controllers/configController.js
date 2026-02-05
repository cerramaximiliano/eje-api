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

// ========== INDIVIDUAL WORKER MANAGEMENT ==========

/**
 * Get individual worker configuration and status
 * GET /config/manager/worker/:workerType
 */
const getWorkerConfig = async (req, res) => {
  try {
    const { workerType } = req.params;

    if (!['verification', 'update', 'stuck'].includes(workerType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid worker type. Must be verification, update, or stuck'
      });
    }

    const managerConfig = await ManagerConfigEje.getOrCreate();

    const workerConfig = managerConfig.config?.workers?.[workerType];
    const workerStatus = managerConfig.currentState?.workers?.[workerType];

    // Determine effective schedule
    const usesGlobalSchedule = workerConfig?.schedule?.useGlobalSchedule !== false;
    const effectiveSchedule = usesGlobalSchedule
      ? {
          workStartHour: managerConfig.config?.workStartHour,
          workEndHour: managerConfig.config?.workEndHour,
          workDays: managerConfig.config?.workDays,
          useGlobalSchedule: true,
          source: 'global'
        }
      : {
          workStartHour: workerConfig?.schedule?.workStartHour,
          workEndHour: workerConfig?.schedule?.workEndHour,
          workDays: workerConfig?.schedule?.workDays,
          useGlobalSchedule: false,
          source: 'worker-specific'
        };

    return res.json({
      success: true,
      data: {
        workerType,
        config: workerConfig || {},
        status: workerStatus || {},
        effectiveSchedule,
        globalSettings: {
          workStartHour: managerConfig.config?.workStartHour,
          workEndHour: managerConfig.config?.workEndHour,
          workDays: managerConfig.config?.workDays,
          timezone: managerConfig.config?.timezone,
          cpuThreshold: managerConfig.config?.cpuThreshold,
          memoryThreshold: managerConfig.config?.memoryThreshold
        }
      }
    });
  } catch (error) {
    logger.error({ error: error.message, workerType: req.params.workerType }, 'Error getting worker config');
    return res.status(500).json({
      success: false,
      message: 'Error getting worker configuration',
      error: error.message
    });
  }
};

/**
 * Update individual worker configuration
 * PATCH /config/manager/worker/:workerType
 */
const updateWorkerConfig = async (req, res) => {
  try {
    const { workerType } = req.params;

    if (!['verification', 'update', 'stuck'].includes(workerType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid worker type. Must be verification, update, or stuck'
      });
    }

    const allowedFields = [
      'enabled',
      'minWorkers',
      'maxWorkers',
      'scaleUpThreshold',
      'scaleDownThreshold',
      'updateThresholdHours',
      'batchSize',
      'delayBetweenRequests',
      'maxRetries',
      'cronExpression',
      'workerName',
      'workerScript',
      'maxMemoryRestart'
    ];

    // Schedule fields (nested)
    const scheduleFields = [
      'schedule.workStartHour',
      'schedule.workEndHour',
      'schedule.workDays',
      'schedule.useGlobalSchedule'
    ];

    const updates = {};

    // Handle regular fields
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[`config.workers.${workerType}.${field}`] = req.body[field];
      }
    }

    // Handle schedule fields (can be sent as nested object or flat)
    if (req.body.schedule && typeof req.body.schedule === 'object') {
      // Nested schedule object
      if (req.body.schedule.workStartHour !== undefined) {
        updates[`config.workers.${workerType}.schedule.workStartHour`] = req.body.schedule.workStartHour;
      }
      if (req.body.schedule.workEndHour !== undefined) {
        updates[`config.workers.${workerType}.schedule.workEndHour`] = req.body.schedule.workEndHour;
      }
      if (req.body.schedule.workDays !== undefined) {
        updates[`config.workers.${workerType}.schedule.workDays`] = req.body.schedule.workDays;
      }
      if (req.body.schedule.useGlobalSchedule !== undefined) {
        updates[`config.workers.${workerType}.schedule.useGlobalSchedule`] = req.body.schedule.useGlobalSchedule;
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }

    const config = await ManagerConfigEje.findOneAndUpdate(
      { name: 'eje-manager' },
      { $set: updates },
      { new: true }
    );

    logger.info({ workerType, updates: req.body }, 'Worker configuration updated');

    return res.json({
      success: true,
      message: `${workerType} worker configuration updated`,
      data: config?.config?.workers?.[workerType]
    });
  } catch (error) {
    logger.error({ error: error.message, workerType: req.params.workerType }, 'Error updating worker config');
    return res.status(500).json({
      success: false,
      message: 'Error updating worker configuration',
      error: error.message
    });
  }
};

/**
 * Toggle individual worker enabled state
 * POST /config/manager/worker/:workerType/toggle
 */
const toggleWorker = async (req, res) => {
  try {
    const { workerType } = req.params;

    if (!['verification', 'update', 'stuck'].includes(workerType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid worker type. Must be verification, update, or stuck'
      });
    }

    const config = await ManagerConfigEje.getOrCreate();
    const currentEnabled = config.config?.workers?.[workerType]?.enabled || false;
    const newState = !currentEnabled;

    await ManagerConfigEje.findOneAndUpdate(
      { name: 'eje-manager' },
      { $set: { [`config.workers.${workerType}.enabled`]: newState } }
    );

    logger.info({ workerType, enabled: newState }, 'Worker enabled state toggled');

    return res.json({
      success: true,
      message: `${workerType} worker ${newState ? 'enabled' : 'disabled'}`,
      workerType,
      enabled: newState
    });
  } catch (error) {
    logger.error({ error: error.message, workerType: req.params.workerType }, 'Error toggling worker');
    return res.status(500).json({
      success: false,
      message: 'Error toggling worker state',
      error: error.message
    });
  }
};

/**
 * Get all workers summary (config and status for all types)
 * GET /config/manager/workers
 */
const getAllWorkersConfig = async (req, res) => {
  try {
    const managerConfig = await ManagerConfigEje.getOrCreate();

    const workers = ['verification', 'update', 'stuck'].map(workerType => {
      const workerConfig = managerConfig.config?.workers?.[workerType] || {};
      const usesGlobalSchedule = workerConfig?.schedule?.useGlobalSchedule !== false;

      return {
        workerType,
        config: workerConfig,
        status: managerConfig.currentState?.workers?.[workerType] || {},
        effectiveSchedule: usesGlobalSchedule
          ? {
              workStartHour: managerConfig.config?.workStartHour,
              workEndHour: managerConfig.config?.workEndHour,
              workDays: managerConfig.config?.workDays,
              useGlobalSchedule: true,
              source: 'global'
            }
          : {
              workStartHour: workerConfig?.schedule?.workStartHour,
              workEndHour: workerConfig?.schedule?.workEndHour,
              workDays: workerConfig?.schedule?.workDays,
              useGlobalSchedule: false,
              source: 'worker-specific'
            }
      };
    });

    return res.json({
      success: true,
      data: {
        workers,
        globalSettings: {
          checkInterval: managerConfig.config?.checkInterval,
          workStartHour: managerConfig.config?.workStartHour,
          workEndHour: managerConfig.config?.workEndHour,
          workDays: managerConfig.config?.workDays,
          timezone: managerConfig.config?.timezone,
          cpuThreshold: managerConfig.config?.cpuThreshold,
          memoryThreshold: managerConfig.config?.memoryThreshold
        },
        managerState: {
          isRunning: managerConfig.currentState?.isRunning,
          isPaused: managerConfig.currentState?.isPaused,
          lastCycleAt: managerConfig.currentState?.lastCycleAt,
          cycleCount: managerConfig.currentState?.cycleCount,
          systemResources: managerConfig.currentState?.systemResources
        }
      }
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error getting all workers config');
    return res.status(500).json({
      success: false,
      message: 'Error getting workers configuration',
      error: error.message
    });
  }
};

/**
 * Update global manager settings (not worker-specific)
 * PATCH /config/manager/settings
 */
const updateGlobalSettings = async (req, res) => {
  try {
    const allowedFields = [
      'checkInterval',
      'lockTimeoutMinutes',
      'updateThresholdHours',
      'cpuThreshold',
      'memoryThreshold',
      'workStartHour',
      'workEndHour',
      'workDays',
      'timezone'
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[`config.${field}`] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }

    const config = await ManagerConfigEje.findOneAndUpdate(
      { name: 'eje-manager' },
      { $set: updates },
      { new: true }
    );

    logger.info({ updates: req.body }, 'Global manager settings updated');

    return res.json({
      success: true,
      message: 'Global settings updated',
      data: {
        checkInterval: config?.config?.checkInterval,
        lockTimeoutMinutes: config?.config?.lockTimeoutMinutes,
        updateThresholdHours: config?.config?.updateThresholdHours,
        cpuThreshold: config?.config?.cpuThreshold,
        memoryThreshold: config?.config?.memoryThreshold,
        workStartHour: config?.config?.workStartHour,
        workEndHour: config?.config?.workEndHour,
        workDays: config?.config?.workDays,
        timezone: config?.config?.timezone
      }
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error updating global settings');
    return res.status(500).json({
      success: false,
      message: 'Error updating global settings',
      error: error.message
    });
  }
};

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
  getRunHistory,
  // Individual worker management
  getWorkerConfig,
  updateWorkerConfig,
  toggleWorker,
  getAllWorkersConfig,
  updateGlobalSettings
};
