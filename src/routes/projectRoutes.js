const express = require('express');
const { 
    getProjects, 
    createProject, 
    getProjectTerms, 
    updateProjectContractAndTerms,
    deleteProject,
    getDeletedProjects,
    restoreProject,
    getProjectProfitabilityReport,
    realizePaymentTerm
} = require('../controllers/projectController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

// -----------------------------------------------------------------------------
// 1. ENDPOINT KATALOG PROYEK & LOG AUDIT (STATIC ROUTES)
// Catatan: Route statis seperti /deleted-log diletakkan di atas route dinamis (:projectId)
// -----------------------------------------------------------------------------

// Mengambil seluruh folder proyek aktif
router.get('/', verifyToken, getProjects);

// Membuat folder proyek baru (Maker / Admin / Super Admin)
router.post('/', verifyToken, requireRole(['Maker', 'Admin', 'Super Admin']), createProject);

// Mengambil daftar folder proyek yang dihapus untuk konsol recovery (Admin & Super Admin)
router.get('/deleted-log', verifyToken, requireRole(['Admin', 'Super Admin']), getDeletedProjects);


// -----------------------------------------------------------------------------
// 2. ENDPOINT MODUL PROYEK TERISOLASI (DYNAMIC ROUTES)
// -----------------------------------------------------------------------------

// Mengambil skema termin pembayaran proyek
router.get('/:projectId/terms', verifyToken, getProjectTerms);

// Memperbarui nilai kontrak utama dan skema termin pembayaran
router.put('/:projectId/contract', verifyToken, requireRole(['Maker', 'Admin', 'Super Admin']), updateProjectContractAndTerms);

// Memproses pencairan / penagihan termin (Otomatis mengirimkan Inflow ke Workbench Cashflow)
router.post('/:projectId/terms/:termId/realize', verifyToken, requireRole(['Maker', 'Admin', 'Super Admin']), realizePaymentTerm);

// Mengambil Laporan Eksekutif Untung-Rugi Proyek untuk Audit
router.get('/:projectId/profitability', verifyToken, getProjectProfitabilityReport);

// Soft Delete folder proyek oleh Maker
router.delete('/:projectId', verifyToken, requireRole(['Maker', 'Admin', 'Super Admin']), deleteProject);

// Memulihkan (Recovery) folder proyek yang telah dihapus oleh Admin / Super Admin
router.post('/:projectId/restore', verifyToken, requireRole(['Admin', 'Super Admin']), restoreProject);

module.exports = router;