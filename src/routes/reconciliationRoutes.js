const express = require('express');
const { reconcileCSV } = require('../controllers/reconciliationController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');

const router = express.Router();

// Hanya Auditor dan Checker yang bisa melakukan rekonsiliasi
router.post('/match', verifyToken, requireRole(['Auditor', 'Checker']), upload.single('file'), reconcileCSV);

module.exports = router;