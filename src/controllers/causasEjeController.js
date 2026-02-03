const { CausasEje } = require('eje-models');
const { logger } = require('../config/pino');
const {
  buildPaginationMeta,
  sanitizeQueryParams,
  buildCausaFilter,
  parseCuij
} = require('../utils/helpers');

/**
 * Find causa by CUIJ
 * GET /causas-eje/cuij/:cuij
 */
const findByCuij = async (req, res) => {
  try {
    const { cuij } = req.params;

    const causa = await CausasEje.findOne({
      cuij: { $regex: cuij, $options: 'i' }
    });

    if (!causa) {
      return res.status(404).json({
        success: false,
        message: 'Causa not found'
      });
    }

    return res.json({
      success: true,
      data: causa
    });
  } catch (error) {
    logger.error({ error: error.message, cuij: req.params.cuij }, 'Error finding causa by CUIJ');
    return res.status(500).json({
      success: false,
      message: 'Error finding causa',
      error: error.message
    });
  }
};

/**
 * Find causa by number and year
 * GET /causas-eje/:number/:year
 */
const findByNumberAndYear = async (req, res) => {
  try {
    const { number, year } = req.params;

    const causa = await CausasEje.findOne({
      numero: parseInt(number, 10),
      anio: parseInt(year, 10)
    });

    if (!causa) {
      return res.status(404).json({
        success: false,
        message: 'Causa not found'
      });
    }

    return res.json({
      success: true,
      data: causa
    });
  } catch (error) {
    logger.error({ error: error.message, number: req.params.number, year: req.params.year }, 'Error finding causa');
    return res.status(500).json({
      success: false,
      message: 'Error finding causa',
      error: error.message
    });
  }
};

/**
 * Find causa by MongoDB ID
 * GET /causas-eje/id/:id
 */
const findById = async (req, res) => {
  try {
    const { id } = req.params;

    const causa = await CausasEje.findById(id);

    if (!causa) {
      return res.status(404).json({
        success: false,
        message: 'Causa not found'
      });
    }

    return res.json({
      success: true,
      data: causa
    });
  } catch (error) {
    logger.error({ error: error.message, id: req.params.id }, 'Error finding causa by ID');
    return res.status(500).json({
      success: false,
      message: 'Error finding causa',
      error: error.message
    });
  }
};

/**
 * Search causas with filters
 * GET /causas-eje/buscar
 */
const searchCausas = async (req, res) => {
  try {
    const query = sanitizeQueryParams(req.query);
    const page = parseInt(query.page, 10) || 1;
    const limit = Math.min(parseInt(query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    // Build sort
    const sortField = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sort = { [sortField]: sortOrder };

    // Build filter
    const filter = buildCausaFilter(query);

    // Execute query
    const [causas, total] = await Promise.all([
      CausasEje.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      CausasEje.countDocuments(filter)
    ]);

    return res.json({
      success: true,
      data: causas,
      pagination: buildPaginationMeta(page, limit, total)
    });
  } catch (error) {
    logger.error({ error: error.message, query: req.query }, 'Error searching causas');
    return res.status(500).json({
      success: false,
      message: 'Error searching causas',
      error: error.message
    });
  }
};

/**
 * Get movimientos for a causa
 * GET /causas-eje/:id/movimientos
 */
const getMovimientos = async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const causa = await CausasEje.findById(id).select('movimientos movimientosCount cuij').lean();

    if (!causa) {
      return res.status(404).json({
        success: false,
        message: 'Causa not found'
      });
    }

    const movimientos = causa.movimientos || [];
    const total = movimientos.length;
    const start = (page - 1) * limit;
    const paginatedMovimientos = movimientos.slice(start, start + limit);

    return res.json({
      success: true,
      data: paginatedMovimientos,
      pagination: buildPaginationMeta(page, limit, total),
      cuij: causa.cuij
    });
  } catch (error) {
    logger.error({ error: error.message, id: req.params.id }, 'Error getting movimientos');
    return res.status(500).json({
      success: false,
      message: 'Error getting movimientos',
      error: error.message
    });
  }
};

/**
 * Get intervinientes for a causa
 * GET /causas-eje/:id/intervinientes
 */
const getIntervinientes = async (req, res) => {
  try {
    const { id } = req.params;

    const causa = await CausasEje.findById(id).select('intervinientes cuij').lean();

    if (!causa) {
      return res.status(404).json({
        success: false,
        message: 'Causa not found'
      });
    }

    return res.json({
      success: true,
      data: causa.intervinientes || [],
      cuij: causa.cuij
    });
  } catch (error) {
    logger.error({ error: error.message, id: req.params.id }, 'Error getting intervinientes');
    return res.status(500).json({
      success: false,
      message: 'Error getting intervinientes',
      error: error.message
    });
  }
};

/**
 * Get causas relacionadas for a causa
 * GET /causas-eje/:id/relacionadas
 */
const getCausasRelacionadas = async (req, res) => {
  try {
    const { id } = req.params;

    const causa = await CausasEje.findById(id).select('causasRelacionadas cuij').lean();

    if (!causa) {
      return res.status(404).json({
        success: false,
        message: 'Causa not found'
      });
    }

    return res.json({
      success: true,
      data: causa.causasRelacionadas || [],
      cuij: causa.cuij
    });
  } catch (error) {
    logger.error({ error: error.message, id: req.params.id }, 'Error getting causas relacionadas');
    return res.status(500).json({
      success: false,
      message: 'Error getting causas relacionadas',
      error: error.message
    });
  }
};

/**
 * Get statistics
 * GET /causas-eje/stats
 */
const getStats = async (req, res) => {
  try {
    const [
      totalCausas,
      verifiedCausas,
      validCausas,
      privateCausas,
      detailsLoadedCausas,
      pendingVerification,
      pendingDetails,
      withErrors
    ] = await Promise.all([
      CausasEje.countDocuments(),
      CausasEje.countDocuments({ verified: true }),
      CausasEje.countDocuments({ isValid: true }),
      CausasEje.countDocuments({ isPrivate: true }),
      CausasEje.countDocuments({ detailsLoaded: true }),
      CausasEje.countDocuments({ verified: false, isValid: true }),
      CausasEje.countDocuments({ verified: true, isValid: true, detailsLoaded: false }),
      CausasEje.countDocuments({ errorCount: { $gt: 0 } })
    ]);

    // Get distribution by estado
    const estadoDistribution = await CausasEje.aggregate([
      { $match: { estado: { $ne: null } } },
      { $group: { _id: '$estado', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Get recent activity
    const recentActivity = await CausasEje.find()
      .sort({ updatedAt: -1 })
      .limit(5)
      .select('cuij caratula updatedAt verified detailsLoaded')
      .lean();

    return res.json({
      success: true,
      data: {
        total: totalCausas,
        verified: verifiedCausas,
        valid: validCausas,
        private: privateCausas,
        detailsLoaded: detailsLoadedCausas,
        pendingVerification,
        pendingDetails,
        withErrors,
        estadoDistribution,
        recentActivity
      }
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error getting stats');
    return res.status(500).json({
      success: false,
      message: 'Error getting stats',
      error: error.message
    });
  }
};

/**
 * Create or update causa (Admin)
 * POST /causas-eje
 */
const createCausa = async (req, res) => {
  try {
    const causaData = req.body;

    // Validate required fields
    if (!causaData.cuij && (!causaData.numero || !causaData.anio)) {
      return res.status(400).json({
        success: false,
        message: 'CUIJ or numero/anio is required'
      });
    }

    // Check if exists
    let existingCausa = null;
    if (causaData.cuij) {
      existingCausa = await CausasEje.findOne({ cuij: causaData.cuij });
    } else {
      existingCausa = await CausasEje.findOne({
        numero: causaData.numero,
        anio: causaData.anio
      });
    }

    if (existingCausa) {
      // Update existing
      Object.assign(existingCausa, causaData);
      await existingCausa.save();

      logger.info({ cuij: existingCausa.cuij }, 'Causa updated');

      return res.json({
        success: true,
        message: 'Causa updated',
        data: existingCausa,
        created: false
      });
    }

    // Create new
    const newCausa = new CausasEje({
      ...causaData,
      source: causaData.source || 'app'
    });
    await newCausa.save();

    logger.info({ cuij: newCausa.cuij }, 'Causa created');

    return res.status(201).json({
      success: true,
      message: 'Causa created',
      data: newCausa,
      created: true
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error creating causa');
    return res.status(500).json({
      success: false,
      message: 'Error creating causa',
      error: error.message
    });
  }
};

/**
 * Update causa (Admin)
 * PATCH /causas-eje/:id
 */
const updateCausa = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const causa = await CausasEje.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );

    if (!causa) {
      return res.status(404).json({
        success: false,
        message: 'Causa not found'
      });
    }

    logger.info({ id, cuij: causa.cuij }, 'Causa updated');

    return res.json({
      success: true,
      message: 'Causa updated',
      data: causa
    });
  } catch (error) {
    logger.error({ error: error.message, id: req.params.id }, 'Error updating causa');
    return res.status(500).json({
      success: false,
      message: 'Error updating causa',
      error: error.message
    });
  }
};

/**
 * Delete causa (Admin)
 * DELETE /causas-eje/:id
 */
const deleteCausa = async (req, res) => {
  try {
    const { id } = req.params;

    const causa = await CausasEje.findByIdAndDelete(id);

    if (!causa) {
      return res.status(404).json({
        success: false,
        message: 'Causa not found'
      });
    }

    logger.info({ id, cuij: causa.cuij }, 'Causa deleted');

    return res.json({
      success: true,
      message: 'Causa deleted',
      data: { id, cuij: causa.cuij }
    });
  } catch (error) {
    logger.error({ error: error.message, id: req.params.id }, 'Error deleting causa');
    return res.status(500).json({
      success: false,
      message: 'Error deleting causa',
      error: error.message
    });
  }
};

/**
 * Get causas by folder ID
 * GET /causas-eje/folder/:folderId
 */
const findByFolderId = async (req, res) => {
  try {
    const { folderId } = req.params;
    const mongoose = require('mongoose');

    const causas = await CausasEje.find({
      folderIds: mongoose.Types.ObjectId(folderId)
    }).lean();

    return res.json({
      success: true,
      data: causas,
      count: causas.length
    });
  } catch (error) {
    logger.error({ error: error.message, folderId: req.params.folderId }, 'Error finding causas by folder');
    return res.status(500).json({
      success: false,
      message: 'Error finding causas',
      error: error.message
    });
  }
};

/**
 * Get causas by user ID
 * GET /causas-eje/user/:userId
 */
const findByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    const mongoose = require('mongoose');
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    const filter = {
      userCausaIds: mongoose.Types.ObjectId(userId)
    };

    const [causas, total] = await Promise.all([
      CausasEje.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CausasEje.countDocuments(filter)
    ]);

    return res.json({
      success: true,
      data: causas,
      pagination: buildPaginationMeta(page, limit, total)
    });
  } catch (error) {
    logger.error({ error: error.message, userId: req.params.userId }, 'Error finding causas by user');
    return res.status(500).json({
      success: false,
      message: 'Error finding causas',
      error: error.message
    });
  }
};

module.exports = {
  findByCuij,
  findByNumberAndYear,
  findById,
  searchCausas,
  getMovimientos,
  getIntervinientes,
  getCausasRelacionadas,
  getStats,
  createCausa,
  updateCausa,
  deleteCausa,
  findByFolderId,
  findByUserId
};
