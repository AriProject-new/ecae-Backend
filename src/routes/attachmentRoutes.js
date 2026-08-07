const express = require('express');
const { uploadAttachment } = require('../controllers/attachmentController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');

const router = express.Router();

// Route upload menggunakan middleware 'upload.single('file')'
router.post('/upload', verifyToken, requireRole(['Maker']), upload.single('file'), uploadAttachment);

module.exports = router;