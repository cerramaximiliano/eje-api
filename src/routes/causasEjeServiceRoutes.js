const express = require('express');
const router = express.Router();
const { verifyToken, verifyApiKey, verifyTokenOrApiKey } = require('../middleware/auth');
const controller = require('../controllers/causasEjeServiceController');

// User routes (require JWT)
router.post('/associate-folder', verifyToken, controller.associateFolder);
router.delete('/dissociate-folder', verifyToken, controller.dissociateFolder);
router.get('/by-folder/:folderId', verifyToken, controller.findByFolder);
router.patch('/update-preference', verifyToken, controller.updateUserPreference);

// Worker routes (require API key)
router.get('/pending-verification', verifyApiKey, controller.getPendingVerification);
router.get('/pending-update', verifyApiKey, controller.getPendingUpdate);
router.post('/lock/:causaId', verifyApiKey, controller.lockCausa);
router.post('/unlock/:causaId', verifyApiKey, controller.unlockCausa);

module.exports = router;
