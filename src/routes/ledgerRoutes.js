const express = require('express');
const { createJournalDraft, getAllJournals } = require('../controllers/ledgerController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/draft', verifyToken, requireRole(['Maker']), createJournalDraft);
// Tambahkan baris ini:
router.get('/', verifyToken, getAllJournals);

module.exports = router;