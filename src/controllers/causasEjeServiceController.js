const causasEjeService = require('../service/causasEjeService');
const { logger } = require('../config/pino');

/**
 * Associate folder to causa
 * POST /causas-eje-service/associate-folder
 */
const associateFolder = async (req, res) => {
  try {
    const { causaId, cuij, numero, anio, folderId, searchTerm } = req.body;
    const userId = req.userId;

    if (!folderId) {
      return res.status(400).json({
        success: false,
        message: 'folderId is required'
      });
    }

    if (!causaId && !cuij && (!numero || !anio)) {
      return res.status(400).json({
        success: false,
        message: 'causaId, cuij, or numero/anio is required'
      });
    }

    const result = await causasEjeService.associateFolderToCausa({
      causaId,
      cuij,
      numero,
      anio,
      folderId,
      userId,
      searchTerm
    });

    return res.json({
      success: true,
      message: result.created ? 'Causa created and folder associated' : 'Folder associated to existing causa',
      ...result
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error associating folder');
    return res.status(500).json({
      success: false,
      message: 'Error associating folder',
      error: error.message
    });
  }
};

/**
 * Dissociate folder from causa
 * DELETE /causas-eje-service/dissociate-folder
 */
const dissociateFolder = async (req, res) => {
  try {
    const { causaId, folderId } = req.body;
    const userId = req.userId;

    if (!causaId || !folderId) {
      return res.status(400).json({
        success: false,
        message: 'causaId and folderId are required'
      });
    }

    const result = await causasEjeService.dissociateFolderFromCausa({
      causaId,
      folderId,
      userId
    });

    if (!result.success) {
      return res.status(404).json(result);
    }

    return res.json({
      success: true,
      message: 'Folder dissociated from causa',
      ...result
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error dissociating folder');
    return res.status(500).json({
      success: false,
      message: 'Error dissociating folder',
      error: error.message
    });
  }
};

/**
 * Find causa by folder
 * GET /causas-eje-service/by-folder/:folderId
 */
const findByFolder = async (req, res) => {
  try {
    const { folderId } = req.params;

    const causa = await causasEjeService.findCausaByFolderId(folderId);

    if (!causa) {
      return res.status(404).json({
        success: false,
        message: 'No causa found for this folder'
      });
    }

    return res.json({
      success: true,
      data: causa
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error finding causa by folder');
    return res.status(500).json({
      success: false,
      message: 'Error finding causa',
      error: error.message
    });
  }
};

/**
 * Update user update preference
 * PATCH /causas-eje-service/update-preference
 */
const updateUserPreference = async (req, res) => {
  try {
    const { causaId, enabled } = req.body;
    const userId = req.userId;

    if (!causaId || enabled === undefined) {
      return res.status(400).json({
        success: false,
        message: 'causaId and enabled are required'
      });
    }

    const result = await causasEjeService.updateUserUpdatePreference({
      causaId,
      userId,
      enabled
    });

    if (!result.success) {
      return res.status(404).json(result);
    }

    return res.json({
      success: true,
      message: `Updates ${enabled ? 'enabled' : 'disabled'} for this causa`,
      ...result
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error updating preference');
    return res.status(500).json({
      success: false,
      message: 'Error updating preference',
      error: error.message
    });
  }
};

/**
 * Get pending causas for verification (Worker endpoint)
 * GET /causas-eje-service/pending-verification
 */
const getPendingVerification = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;

    const causas = await causasEjeService.getPendingVerification(limit);

    return res.json({
      success: true,
      data: causas,
      count: causas.length
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error getting pending verification');
    return res.status(500).json({
      success: false,
      message: 'Error getting pending causas',
      error: error.message
    });
  }
};

/**
 * Get pending causas for update (Worker endpoint)
 * GET /causas-eje-service/pending-update
 */
const getPendingUpdate = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;

    const causas = await causasEjeService.getPendingUpdate(limit);

    return res.json({
      success: true,
      data: causas,
      count: causas.length
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error getting pending update');
    return res.status(500).json({
      success: false,
      message: 'Error getting pending causas',
      error: error.message
    });
  }
};

/**
 * Lock causa for processing (Worker endpoint)
 * POST /causas-eje-service/lock/:causaId
 */
const lockCausa = async (req, res) => {
  try {
    const { causaId } = req.params;
    const { workerId } = req.body;

    if (!workerId) {
      return res.status(400).json({
        success: false,
        message: 'workerId is required'
      });
    }

    const locked = await causasEjeService.lockCausa(causaId, workerId);

    return res.json({
      success: locked,
      message: locked ? 'Causa locked' : 'Could not lock causa (already locked or not found)'
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error locking causa');
    return res.status(500).json({
      success: false,
      message: 'Error locking causa',
      error: error.message
    });
  }
};

/**
 * Unlock causa after processing (Worker endpoint)
 * POST /causas-eje-service/unlock/:causaId
 */
const unlockCausa = async (req, res) => {
  try {
    const { causaId } = req.params;

    const unlocked = await causasEjeService.unlockCausa(causaId);

    return res.json({
      success: unlocked,
      message: unlocked ? 'Causa unlocked' : 'Error unlocking causa'
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error unlocking causa');
    return res.status(500).json({
      success: false,
      message: 'Error unlocking causa',
      error: error.message
    });
  }
};

module.exports = {
  associateFolder,
  dissociateFolder,
  findByFolder,
  updateUserPreference,
  getPendingVerification,
  getPendingUpdate,
  lockCausa,
  unlockCausa
};
