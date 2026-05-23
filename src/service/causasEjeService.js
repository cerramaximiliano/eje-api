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

    // Find existing causa (preferring non-pivot causas)
    if (causaId) {
      causa = await CausasEje.findById(causaId);
    } else if (cuij) {
      // Primero buscar causa normal, luego pivot
      causa = await CausasEje.findOne({ cuij, isPivot: { $ne: true } });
      if (!causa) {
        causa = await CausasEje.findOne({ cuij });
      }
    } else if (numero && anio) {
      // Primero buscar causa normal con ese número/año
      causa = await CausasEje.findOne({ numero, anio, isPivot: { $ne: true } });

      // Si no hay causa normal, buscar un pivot
      if (!causa) {
        // Buscar pivot por numero/anio (más robusto que searchTerm)
        causa = await CausasEje.findOne({
          isPivot: true,
          numero: numero,
          anio: anio
        });

        // Fallback: buscar por searchTerm original (por compatibilidad)
        if (!causa && searchTerm) {
          causa = await CausasEje.findOne({
            isPivot: true,
            searchTerm: searchTerm
          });
        }
      }
    }

    const folderObjectId = new mongoose.Types.ObjectId(folderId);
    const userObjectId = userId ? new mongoose.Types.ObjectId(userId) : null;

    if (causa) {
      // Update existing causa
      const updateOps = {
        $addToSet: { folderIds: folderObjectId }
      };

      if (userObjectId) {
        updateOps.$addToSet.userCausaIds = userObjectId;

        // Check if user already has update preference set
        const existingUserPref = causa.userUpdatesEnabled?.find(
          u => u.userId?.toString() === userObjectId.toString()
        );

        // If user doesn't have preference, add with enabled: true
        if (!existingUserPref) {
          if (!updateOps.$addToSet.userUpdatesEnabled) {
            updateOps.$addToSet.userUpdatesEnabled = { userId: userObjectId, enabled: true };
          }
          // Set update flag to true since new user wants updates
          updateOps.$set = { update: true };
        }
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

      logger.info({ causaId: causa._id, folderId, isPivot: causa.isPivot }, 'Folder associated to existing causa');

      // Preparar respuesta base
      const response = {
        success: true,
        created: false,
        causaId: causa._id,
        cuij: causa.cuij,
        verified: causa.verified,
        isValid: causa.isValid,
        caratula: causa.caratula,
        // isPrivate determina folderJuris.item en law-analytics-server:
        // true  → "CABA - Penal Contravencional y Faltas" (causas privadas)
        // false → "CABA - Contencioso Administrativo y Tributario" (default)
        isPrivate: causa.isPrivate === true,
        // fechaInicio se propaga a folder.initialDateFolder y
        // folder.judFolder.initialDateJudFolder en el create del server.
        // Puede ser null/undefined si la causa todavía no fue scrapeada
        // en profundidad (verification-worker la setea cuando aparece).
        fechaInicio: causa.fechaInicio || null
      };

      // Si es un pivot, incluir datos adicionales para selección múltiple
      if (causa.isPivot) {
        response.isPivot = true;
        response.pivotCausaIds = causa.pivotCausaIds || [];
        response.pendingCausaIds = causa.pivotCausaIds || [];  // Alias para compatibilidad con folderController
        response.causaAssociationStatus = 'pending_selection';
        response.searchTerm = causa.searchTerm;
      }

      return response;
    }

    // Create new causa (minimal data, will be verified and updated by workers)
    const newCausa = new CausasEje({
      cuij: cuij || `PENDING-${numero}/${anio}`,
      numero: numero || 0,
      anio: anio || 0,
      caratula: `Pendiente de verificación: ${searchTerm || cuij || `${numero}/${anio}`}`,
      folderIds: [folderObjectId],
      userCausaIds: userObjectId ? [userObjectId] : [],
      userUpdatesEnabled: userObjectId ? [{ userId: userObjectId, enabled: true }] : [],
      update: true,  // Always true when has folderIds
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
      cuij: newCausa.cuij,
      verified: newCausa.verified,
      isValid: newCausa.isValid,
      caratula: newCausa.caratula,
      // Causa recién creada: isPrivate y fechaInicio aún desconocidos.
      isPrivate: false,
      fechaInicio: null
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
    const folderObjectId = new mongoose.Types.ObjectId(folderId);

    const causa = await CausasEje.findById(causaId);

    if (!causa) {
      return {
        success: false,
        message: 'Causa not found'
      };
    }

    // Calculate remaining folderIds after removal
    const remainingFolderIds = (causa.folderIds || []).filter(
      id => id.toString() !== folderObjectId.toString()
    );

    // Remove folder from array and update the 'update' field
    const updateOps = {
      $pull: { folderIds: folderObjectId },
      $set: {
        // update = true only if there are remaining folders
        update: remainingFolderIds.length > 0
      }
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
          userId: userId,
          remainingFolders: remainingFolderIds.length
        }
      }
    };

    await CausasEje.findByIdAndUpdate(causaId, updateOps);

    logger.info({ causaId, folderId, remainingFolders: remainingFolderIds.length, update: remainingFolderIds.length > 0 }, 'Folder dissociated from causa');

    return {
      success: true,
      causaId,
      cuij: causa.cuij,
      remainingFolders: remainingFolderIds.length,
      update: remainingFolderIds.length > 0
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
    const folderObjectId = new mongoose.Types.ObjectId(folderId);

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
    const userObjectId = new mongoose.Types.ObjectId(userId);

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

    // Update global update flag: true if has linked folders
    causa.update = causa.folderIds && causa.folderIds.length > 0;

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
