const { CausasEje } = require('eje-models');
const mongoose = require('mongoose');
const { logger } = require('../config/pino');

/**
 * Associate a folder to a causa
 * Creates the causa if it doesn't exist
 */
async function associateFolderToCausa({ causaId, cuij, numero, anio, folderId, userId, searchTerm }) {
  try {
    let causa;

    // Find existing causa
    if (causaId) {
      causa = await CausasEje.findById(causaId);
    } else if (cuij) {
      causa = await CausasEje.findOne({ cuij });
    } else if (numero && anio) {
      causa = await CausasEje.findOne({ numero, anio });
    }

    const folderObjectId = mongoose.Types.ObjectId(folderId);
    const userObjectId = userId ? mongoose.Types.ObjectId(userId) : null;

    if (causa) {
      // Update existing causa
      const updateOps = {
        $addToSet: { folderIds: folderObjectId }
      };

      if (userObjectId) {
        updateOps.$addToSet.userCausaIds = userObjectId;
      }

      // Add to update history
      const historyEntry = {
        timestamp: new Date(),
        source: 'api',
        updateType: 'link',
        success: true,
        movimientosAdded: 0,
        movimientosTotal: causa.movimientos?.length || 0,
        details: {
          folderId: folderId,
          userId: userId,
          searchTerm: searchTerm
        }
      };
      updateOps.$push = { updateHistory: historyEntry };

      await CausasEje.findByIdAndUpdate(causa._id, updateOps);

      logger.info({ causaId: causa._id, folderId }, 'Folder associated to existing causa');

      return {
        success: true,
        created: false,
        causaId: causa._id,
        cuij: causa.cuij
      };
    }

    // Create new causa (minimal data, will be verified and updated by workers)
    const newCausa = new CausasEje({
      cuij: cuij || `PENDING-${numero}/${anio}`,
      numero: numero || 0,
      anio: anio || 0,
      caratula: `Pendiente de verificación: ${searchTerm || cuij || `${numero}/${anio}`}`,
      folderIds: [folderObjectId],
      userCausaIds: userObjectId ? [userObjectId] : [],
      source: 'app',
      verified: false,
      isValid: null,  // null = pendiente de verificación
      detailsLoaded: false,
      updateHistory: [{
        timestamp: new Date(),
        source: 'api',
        updateType: 'link',
        success: true,
        movimientosAdded: 0,
        movimientosTotal: 0,
        details: {
          folderId: folderId,
          userId: userId,
          searchTerm: searchTerm,
          message: 'Causa created from folder association'
        }
      }]
    });

    await newCausa.save();

    logger.info({ causaId: newCausa._id, folderId }, 'New causa created and folder associated');

    return {
      success: true,
      created: true,
      causaId: newCausa._id,
      cuij: newCausa.cuij
    };
  } catch (error) {
    logger.error({ error: error.message, folderId }, 'Error associating folder to causa');
    throw error;
  }
}

/**
 * Dissociate a folder from a causa
 */
async function dissociateFolderFromCausa({ causaId, folderId, userId }) {
  try {
    const folderObjectId = mongoose.Types.ObjectId(folderId);

    const causa = await CausasEje.findById(causaId);

    if (!causa) {
      return {
        success: false,
        message: 'Causa not found'
      };
    }

    // Remove folder from array
    const updateOps = {
      $pull: { folderIds: folderObjectId }
    };

    // Add to update history
    updateOps.$push = {
      updateHistory: {
        timestamp: new Date(),
        source: 'api',
        updateType: 'unlink',
        success: true,
        movimientosAdded: 0,
        movimientosTotal: causa.movimientos?.length || 0,
        details: {
          folderId: folderId,
          userId: userId
        }
      }
    };

    await CausasEje.findByIdAndUpdate(causaId, updateOps);

    logger.info({ causaId, folderId }, 'Folder dissociated from causa');

    return {
      success: true,
      causaId,
      cuij: causa.cuij
    };
  } catch (error) {
    logger.error({ error: error.message, causaId, folderId }, 'Error dissociating folder from causa');
    throw error;
  }
}

/**
 * Find causa by folder ID
 */
async function findCausaByFolderId(folderId) {
  try {
    const folderObjectId = mongoose.Types.ObjectId(folderId);

    const causa = await CausasEje.findOne({
      folderIds: folderObjectId
    });

    return causa;
  } catch (error) {
    logger.error({ error: error.message, folderId }, 'Error finding causa by folder');
    throw error;
  }
}

/**
 * Update user's update preference for a causa
 */
async function updateUserUpdatePreference({ causaId, userId, enabled }) {
  try {
    const userObjectId = mongoose.Types.ObjectId(userId);

    const causa = await CausasEje.findById(causaId);

    if (!causa) {
      return { success: false, message: 'Causa not found' };
    }

    // Find existing preference
    const existingIndex = causa.userUpdatesEnabled.findIndex(
      u => u.userId.toString() === userObjectId.toString()
    );

    if (existingIndex >= 0) {
      causa.userUpdatesEnabled[existingIndex].enabled = enabled;
    } else {
      causa.userUpdatesEnabled.push({ userId: userObjectId, enabled });
    }

    // Update global update flag based on any user having updates enabled
    causa.update = causa.userUpdatesEnabled.some(u => u.enabled);

    await causa.save();

    logger.info({ causaId, userId, enabled }, 'User update preference updated');

    return {
      success: true,
      causaId,
      updateEnabled: causa.update
    };
  } catch (error) {
    logger.error({ error: error.message, causaId, userId }, 'Error updating user preference');
    throw error;
  }
}

/**
 * Get pending causas for verification worker
 * isValid: null = pendiente de verificación
 */
async function getPendingVerification(limit = 10) {
  try {
    const causas = await CausasEje.find({
      verified: false,
      isValid: null,  // null = pendiente de verificación
      errorCount: { $lt: 3 },
      $or: [
        { lockedBy: { $exists: false } },
        { lockedBy: null },
        { lockedAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) } } // Locked more than 10 min ago
      ]
    })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();

    return causas;
  } catch (error) {
    logger.error({ error: error.message }, 'Error getting pending verification');
    throw error;
  }
}

/**
 * Get pending causas for update worker
 */
async function getPendingUpdate(limit = 10) {
  try {
    const causas = await CausasEje.find({
      verified: true,
      isValid: true,
      isPrivate: false,
      detailsLoaded: false,
      errorCount: { $lt: 3 },
      $or: [
        { lockedBy: { $exists: false } },
        { lockedBy: null },
        { lockedAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) } }
      ]
    })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();

    return causas;
  } catch (error) {
    logger.error({ error: error.message }, 'Error getting pending update');
    throw error;
  }
}

/**
 * Lock a causa for processing
 */
async function lockCausa(causaId, workerId) {
  try {
    const result = await CausasEje.findOneAndUpdate(
      {
        _id: causaId,
        $or: [
          { lockedBy: { $exists: false } },
          { lockedBy: null },
          { lockedAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) } }
        ]
      },
      {
        $set: {
          lockedBy: workerId,
          lockedAt: new Date()
        }
      },
      { new: true }
    );

    return !!result;
  } catch (error) {
    logger.error({ error: error.message, causaId, workerId }, 'Error locking causa');
    return false;
  }
}

/**
 * Unlock a causa after processing
 */
async function unlockCausa(causaId) {
  try {
    await CausasEje.findByIdAndUpdate(causaId, {
      $unset: { lockedBy: 1, lockedAt: 1 }
    });
    return true;
  } catch (error) {
    logger.error({ error: error.message, causaId }, 'Error unlocking causa');
    return false;
  }
}

module.exports = {
  associateFolderToCausa,
  dissociateFolderFromCausa,
  findCausaByFolderId,
  updateUserUpdatePreference,
  getPendingVerification,
  getPendingUpdate,
  lockCausa,
  unlockCausa
};
