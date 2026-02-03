const { CausasEje } = require('eje-models');
const { logger } = require('../config/pino');

/**
 * Get worker processing statistics
 * GET /worker-stats
 */
const getStats = async (req, res) => {
  try {
    // Get counts for different states
    const [
      total,
      pendingVerification,
      verified,
      pendingDetails,
      detailsLoaded,
      withErrors,
      private_count,
      invalid,
      locked
    ] = await Promise.all([
      CausasEje.countDocuments(),
      CausasEje.countDocuments({ verified: false, isValid: true }),
      CausasEje.countDocuments({ verified: true }),
      CausasEje.countDocuments({ verified: true, isValid: true, isPrivate: false, detailsLoaded: false }),
      CausasEje.countDocuments({ detailsLoaded: true }),
      CausasEje.countDocuments({ errorCount: { $gt: 0 } }),
      CausasEje.countDocuments({ isPrivate: true }),
      CausasEje.countDocuments({ isValid: false }),
      CausasEje.countDocuments({ lockedBy: { $exists: true, $ne: null } })
    ]);

    // Get error distribution
    const errorDistribution = await CausasEje.aggregate([
      { $match: { errorCount: { $gt: 0 } } },
      {
        $group: {
          _id: '$errorCount',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get recently processed (last 24 hours)
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentlyProcessed = await CausasEje.countDocuments({
      $or: [
        { verifiedAt: { $gte: last24h } },
        { detailsLastUpdate: { $gte: last24h } }
      ]
    });

    // Get stuck documents (locked for more than 10 minutes)
    const stuckThreshold = new Date(Date.now() - 10 * 60 * 1000);
    const stuck = await CausasEje.countDocuments({
      lockedBy: { $exists: true, $ne: null },
      lockedAt: { $lt: stuckThreshold }
    });

    return res.json({
      success: true,
      data: {
        total,
        verification: {
          pending: pendingVerification,
          completed: verified,
          rate: total > 0 ? ((verified / total) * 100).toFixed(1) : 0
        },
        details: {
          pending: pendingDetails,
          completed: detailsLoaded,
          rate: verified > 0 ? ((detailsLoaded / verified) * 100).toFixed(1) : 0
        },
        status: {
          valid: total - invalid,
          invalid,
          private: private_count
        },
        processing: {
          locked,
          stuck,
          recentlyProcessed
        },
        errors: {
          total: withErrors,
          distribution: errorDistribution
        }
      }
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error getting worker stats');
    return res.status(500).json({
      success: false,
      message: 'Error getting stats',
      error: error.message
    });
  }
};

/**
 * Get documents with errors
 * GET /worker-stats/errors
 */
const getErrorDocuments = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    const filter = { errorCount: { $gt: 0 } };

    const [documents, total] = await Promise.all([
      CausasEje.find(filter)
        .sort({ errorCount: -1, updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('cuij numero anio caratula errorCount lastError verified detailsLoaded updatedAt')
        .lean(),
      CausasEje.countDocuments(filter)
    ]);

    return res.json({
      success: true,
      data: documents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error getting error documents');
    return res.status(500).json({
      success: false,
      message: 'Error getting documents',
      error: error.message
    });
  }
};

/**
 * Get stuck documents
 * GET /worker-stats/stuck
 */
const getStuckDocuments = async (req, res) => {
  try {
    const stuckThreshold = new Date(Date.now() - 10 * 60 * 1000);

    const documents = await CausasEje.find({
      lockedBy: { $exists: true, $ne: null },
      lockedAt: { $lt: stuckThreshold }
    })
      .select('cuij numero anio caratula lockedBy lockedAt verified detailsLoaded')
      .lean();

    return res.json({
      success: true,
      data: documents,
      count: documents.length
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error getting stuck documents');
    return res.status(500).json({
      success: false,
      message: 'Error getting documents',
      error: error.message
    });
  }
};

/**
 * Clear stuck locks
 * POST /worker-stats/clear-stuck
 */
const clearStuckLocks = async (req, res) => {
  try {
    const stuckThreshold = new Date(Date.now() - 10 * 60 * 1000);

    const result = await CausasEje.updateMany(
      {
        lockedBy: { $exists: true, $ne: null },
        lockedAt: { $lt: stuckThreshold }
      },
      {
        $unset: { lockedBy: 1, lockedAt: 1 }
      }
    );

    logger.info({ cleared: result.modifiedCount }, 'Cleared stuck locks');

    return res.json({
      success: true,
      message: `Cleared ${result.modifiedCount} stuck locks`,
      cleared: result.modifiedCount
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error clearing stuck locks');
    return res.status(500).json({
      success: false,
      message: 'Error clearing locks',
      error: error.message
    });
  }
};

/**
 * Reset error count for a document
 * POST /worker-stats/reset-error/:id
 */
const resetErrorCount = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await CausasEje.findByIdAndUpdate(
      id,
      {
        $set: { errorCount: 0, lastError: null },
        $unset: { stuckSince: 1 }
      },
      { new: true }
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    logger.info({ id, cuij: result.cuij }, 'Error count reset');

    return res.json({
      success: true,
      message: 'Error count reset',
      data: {
        id,
        cuij: result.cuij
      }
    });
  } catch (error) {
    logger.error({ error: error.message, id: req.params.id }, 'Error resetting error count');
    return res.status(500).json({
      success: false,
      message: 'Error resetting error count',
      error: error.message
    });
  }
};

/**
 * Get recent activity
 * GET /worker-stats/activity
 */
const getRecentActivity = async (req, res) => {
  try {
    const hours = parseInt(req.query.hours, 10) || 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const [verified, updated] = await Promise.all([
      CausasEje.find({ verifiedAt: { $gte: since } })
        .sort({ verifiedAt: -1 })
        .limit(20)
        .select('cuij caratula verifiedAt isValid isPrivate')
        .lean(),
      CausasEje.find({ detailsLastUpdate: { $gte: since } })
        .sort({ detailsLastUpdate: -1 })
        .limit(20)
        .select('cuij caratula detailsLastUpdate movimientosCount')
        .lean()
    ]);

    return res.json({
      success: true,
      data: {
        period: `last ${hours} hours`,
        verified: {
          count: verified.length,
          documents: verified
        },
        updated: {
          count: updated.length,
          documents: updated
        }
      }
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error getting recent activity');
    return res.status(500).json({
      success: false,
      message: 'Error getting activity',
      error: error.message
    });
  }
};

module.exports = {
  getStats,
  getErrorDocuments,
  getStuckDocuments,
  clearStuckLocks,
  resetErrorCount,
  getRecentActivity
};
