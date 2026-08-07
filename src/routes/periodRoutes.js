const express = require('express');
const { lockPeriod } = require('../controllers/periodController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

// Hanya Checker yang diizinkan melakukan lock period
router.post('/lock', verifyToken, requireRole(['Checker']), lockPeriod);

module.exports = router;