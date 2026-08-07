const db = require('../config/db');
const submitJournalForApproval = async (req, res) => {
    try {
        const { id } = req.params;

        // Cek keberadaan jurnal dan statusnya saat ini
        const checkResult = await db.query(
            'SELECT id, status FROM journal_entries WHERE id = $1', 
            [id]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ 
                status: 'error', 
                message: 'Entri cashflow tidak ditemukan.' 
            });
        }

        const journal = checkResult.rows[0];

        if (journal.status !== 'DRAFT') {
            return res.status(400).json({ 
                status: 'error', 
                message: 'Hanya entri berstatus DRAFT yang dapat diajukan ke Checker.' 
            });
        }

        // Update status ke PENDING_APPROVAL
        await db.query(
            `UPDATE journal_entries 
             SET status = 'PENDING_APPROVAL', updated_at = NOW() 
             WHERE id = $1`,
            [id]
        );

        res.status(200).json({
            status: 'success',
            message: 'Entri cashflow proyek berhasil diajukan ke Checker.'
        });
    } catch (error) {
        console.error('Submit Approval Error:', error);
        res.status(500).json({ 
            status: 'error', 
            message: `Gagal mengajukan cashflow proyek: ${error.message}` 
        });
    }
};

/**
 * 2. Process Approval or Rejection (Checker)
 * Checker menyetujui (POSTED) atau menolak (REJECTED) entri kas yang berstatus PENDING_APPROVAL.
 */
const processApproval = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, rejection_reason } = req.body; // action: 'APPROVE' | 'REJECT'

        if (!action || !['APPROVE', 'REJECT'].includes(action)) {
            return res.status(400).json({
                status: 'error',
                message: 'Aksi tidak valid. Gunakan APPROVE atau REJECT.'
            });
        }

        const checkResult = await db.query(
            'SELECT id, status FROM journal_entries WHERE id = $1', 
            [id]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ 
                status: 'error', 
                message: 'Entri cashflow tidak ditemukan.' 
            });
        }

        const journal = checkResult.rows[0];

        if (journal.status !== 'PENDING_APPROVAL') {
            return res.status(400).json({ 
                status: 'error', 
                message: 'Jurnal tidak dalam status PENDING_APPROVAL.' 
            });
        }

        if (action === 'REJECT' && (!rejection_reason || rejection_reason.trim() === '')) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'Alasan penolakan wajib diisi saat menolak transaksi.' 
            });
        }

        const newStatus = action === 'APPROVE' ? 'POSTED' : 'REJECTED';

        await db.query(
            `UPDATE journal_entries 
             SET status = $1, 
                 rejection_reason = $2, 
                 updated_at = NOW() 
             WHERE id = $3`,
            [newStatus, action === 'REJECT' ? rejection_reason : null, id]
        );

        res.status(200).json({
            status: 'success',
            message: `Entri cashflow berhasil ${action === 'APPROVE' ? 'disetujui (POSTED)' : 'ditolak (REJECTED)'}.`
        });
    } catch (error) {
        console.error('Process Approval Error:', error);
        res.status(500).json({ 
            status: 'error', 
            message: `Gagal memproses approval: ${error.message}` 
        });
    }
};

/**
 * 3. Request Deletion (Checker)
 * Checker mengajukan penghapusan transaksi ke Admin/Super Admin.
 * Status transaksi berubah menjadi PENDING_DELETION dan status lamanya disimpan ke previous_status.
 */
const requestJournalDeletion = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        if (!reason || reason.trim() === '') {
            return res.status(400).json({ 
                status: 'error', 
                message: 'Alasan pengajuan penghapusan wajib diisi.' 
            });
        }

        const checkResult = await db.query(
            'SELECT id, status FROM journal_entries WHERE id = $1', 
            [id]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ 
                status: 'error', 
                message: 'Entri cashflow tidak ditemukan.' 
            });
        }

        const currentStatus = checkResult.rows[0].status;

        if (currentStatus === 'PENDING_DELETION') {
            return res.status(400).json({ 
                status: 'error', 
                message: 'Entri cashflow ini sudah dalam proses pengajuan penghapusan.' 
            });
        }

        const requestedBy = req.user?.username || 'Checker';

        await db.query(
            `UPDATE journal_entries 
             SET previous_status = status, 
                 status = 'PENDING_DELETION', 
                 deletion_reason = $1, 
                 deletion_requested_by = $2, 
                 updated_at = NOW() 
             WHERE id = $3`,
            [reason, requestedBy, id]
        );

        res.status(200).json({
            status: 'success',
            message: 'Pengajuan penghapusan berhasil dikirim ke Admin / Super Admin.'
        });
    } catch (error) {
        console.error('Request Deletion Error:', error);
        res.status(500).json({ 
            status: 'error', 
            message: `Gagal mengajukan penghapusan: ${error.message}` 
        });
    }
};

module.exports = {
    submitJournalForApproval,
    processApproval,
    requestJournalDeletion
};