const express = require('express');
const { submitJournalForApproval, processApproval, requestJournalDeletion } = require('../controllers/approvalController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

// Rute Maker
router.post('/:id/submit', verifyToken, requireRole(['Maker']), submitJournalForApproval);

// Rute Checker
router.post('/:id/process', verifyToken, requireRole(['Checker']), processApproval);
router.post('/:id/request-deletion', verifyToken, requireRole(['Checker']), requestJournalDeletion);

module.exports = router;