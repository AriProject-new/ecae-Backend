const express = require('express');
const { getSystemMetrics, getAuditLogs, overrideJournalStatus, processDeletionRequest } = require('../controllers/adminController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

// Hak Akses Observing (Admin & Super Admin)
router.get('/metrics', verifyToken, requireRole(['Admin', 'Super Admin']), getSystemMetrics);
router.get('/audit-logs', verifyToken, requireRole(['Admin', 'Super Admin']), getAuditLogs);

// Hak Akses Governance Penghapusan (Admin & Super Admin)
router.post('/process-deletion/:id', verifyToken, requireRole(['Admin', 'Super Admin']), processDeletionRequest);

// Hak Akses Emergency Repair (Khusus Super Admin)
router.post('/override-journal/:id', verifyToken, requireRole(['Super Admin']), overrideJournalStatus);

module.exports = router;