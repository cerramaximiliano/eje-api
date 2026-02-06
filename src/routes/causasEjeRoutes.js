const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdmin, verifyTokenOrApiKey } = require('../middleware/auth');
const causasEjeController = require('../controllers/causasEjeController');

// Public stats (with API key or token)
router.get('/stats', verifyTokenOrApiKey, causasEjeController.getStats);

// Search and list (both endpoints for backwards compatibility)
router.get('/buscar', verifyTokenOrApiKey, causasEjeController.searchCausas);
router.get('/search', verifyTokenOrApiKey, causasEjeController.searchCausas);

// Find by folder
router.get('/folder/:folderId', verifyToken, causasEjeController.findByFolderId);

// Find by user
router.get('/user/:userId', verifyToken, causasEjeController.findByUserId);

// Find by CUIJ
router.get('/cuij/:cuij', verifyTokenOrApiKey, causasEjeController.findByCuij);

// Find by ID
router.get('/id/:id', verifyTokenOrApiKey, causasEjeController.findById);

// Get movimientos
router.get('/:id/movimientos', verifyToken, causasEjeController.getMovimientos);

// Get intervinientes
router.get('/:id/intervinientes', verifyToken, causasEjeController.getIntervinientes);

// Get causas relacionadas
router.get('/:id/relacionadas', verifyToken, causasEjeController.getCausasRelacionadas);

// Pivot routes
router.get('/:id/linked-causas', verifyToken, causasEjeController.getLinkedCausas);
router.post('/:id/resolve', verifyToken, verifyAdmin, causasEjeController.resolvePivot);

// Find by number and year
router.get('/:number/:year', verifyTokenOrApiKey, causasEjeController.findByNumberAndYear);

// Admin routes
router.post('/', verifyToken, verifyAdmin, causasEjeController.createCausa);
router.patch('/:id', verifyToken, verifyAdmin, causasEjeController.updateCausa);
router.delete('/:id', verifyToken, verifyAdmin, causasEjeController.deleteCausa);

module.exports = router;
