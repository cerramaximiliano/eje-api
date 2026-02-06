/**
 * Utility helpers for EJE API
 */

/**
 * Get current date in Argentina timezone (UTC-3)
 */
function getArgentinaDate() {
  const now = new Date();
  const argentinaOffset = -3 * 60;
  const utcOffset = now.getTimezoneOffset();
  const argentinaTime = new Date(now.getTime() + (utcOffset + argentinaOffset) * 60000);
  return argentinaTime;
}

/**
 * Format date to Argentina locale string
 */
function formatDateAR(date) {
  if (!date) return null;
  const d = new Date(date);
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

/**
 * Parse CUIJ to extract number and year
 * Format: "EXP J-01-00015050-5/2021-0" or "J-01-00015050-5/2021-0"
 */
function parseCuij(cuij) {
  if (!cuij) return null;

  const match = cuij.match(/(\d+)\/(\d{4})/);
  if (match) {
    return {
      numero: parseInt(match[1], 10),
      anio: parseInt(match[2], 10)
    };
  }

  return null;
}

/**
 * Clean CUIJ for search (remove prefixes like IPP, EXP, INC)
 */
function cleanCuijForSearch(cuij) {
  if (!cuij) return '';
  return cuij.replace(/^(IPP|EXP|INC)\s+/i, '').trim();
}

/**
 * Build pagination metadata
 */
function buildPaginationMeta(page, limit, total) {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1
  };
}

/**
 * Sanitize query parameters
 */
function sanitizeQueryParams(query) {
  const sanitized = {};

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      // Trim strings
      if (typeof value === 'string') {
        sanitized[key] = value.trim();
      } else {
        sanitized[key] = value;
      }
    }
  });

  return sanitized;
}

/**
 * Build MongoDB filter from query parameters
 */
function buildCausaFilter(query) {
  const filter = {};

  // CUIJ filter
  if (query.cuij) {
    filter.cuij = { $regex: query.cuij, $options: 'i' };
  }

  // Number and year
  if (query.numero) {
    filter.numero = parseInt(query.numero, 10);
  }

  if (query.anio) {
    filter.anio = parseInt(query.anio, 10);
  }

  // Caratula (title)
  if (query.caratula) {
    filter.caratula = { $regex: query.caratula, $options: 'i' };
  }

  // Juzgado (court)
  if (query.juzgado) {
    filter.juzgado = { $regex: query.juzgado, $options: 'i' };
  }

  // Objeto (subject)
  if (query.objeto) {
    filter.objeto = { $regex: query.objeto, $options: 'i' };
  }

  // Estado (status)
  if (query.estado) {
    filter.estado = query.estado;
  }

  // Verification status
  if (query.verified !== undefined) {
    filter.verified = query.verified === 'true' || query.verified === true;
  }

  if (query.isValid !== undefined) {
    filter.isValid = query.isValid === 'true' || query.isValid === true;
  }

  if (query.isPrivate !== undefined) {
    filter.isPrivate = query.isPrivate === 'true' || query.isPrivate === true;
  }

  if (query.detailsLoaded !== undefined) {
    filter.detailsLoaded = query.detailsLoaded === 'true' || query.detailsLoaded === true;
  }

  // Date range for fechaInicio
  if (query.fechaInicioFrom || query.fechaInicioTo) {
    filter.fechaInicio = {};
    if (query.fechaInicioFrom) {
      filter.fechaInicio.$gte = new Date(query.fechaInicioFrom);
    }
    if (query.fechaInicioTo) {
      filter.fechaInicio.$lte = new Date(query.fechaInicioTo);
    }
  }

  // Folder association
  if (query.folderId) {
    const mongoose = require('mongoose');
    filter.folderIds = mongoose.Types.ObjectId(query.folderId);
  }

  if (query.userId) {
    const mongoose = require('mongoose');
    filter.userCausaIds = mongoose.Types.ObjectId(query.userId);
  }

  // Update flag
  if (query.update !== undefined) {
    filter.update = query.update === 'true' || query.update === true;
  }

  // Pivot filters
  if (query.isPivot !== undefined) {
    filter.isPivot = query.isPivot === 'true' || query.isPivot === true;
  }

  if (query.resolved !== undefined) {
    filter.resolved = query.resolved === 'true' || query.resolved === true;
  }

  if (query.searchTerm) {
    filter.searchTerm = { $regex: query.searchTerm, $options: 'i' };
  }

  // Source filter
  if (query.source) {
    filter.source = query.source;
  }

  return filter;
}

module.exports = {
  getArgentinaDate,
  formatDateAR,
  parseCuij,
  cleanCuijForSearch,
  buildPaginationMeta,
  sanitizeQueryParams,
  buildCausaFilter
};
