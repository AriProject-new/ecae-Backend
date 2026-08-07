const db = require('../config/db');

// 1. Observing: Metrik Transaksi
const getSystemMetrics = async (req, res) => {
    try {
        const metricsQuery = `
            SELECT 
                COUNT(*) FILTER (WHERE status = 'DRAFT') AS total_draft,
                COUNT(*) FILTER (WHERE status = 'PENDING_APPROVAL') AS total_pending,
                COUNT(*) FILTER (WHERE status = 'POSTED') AS total_posted,
                COUNT(*) FILTER (WHERE status = 'REJECTED') AS total_rejected,
                COUNT(*) FILTER (WHERE status = 'PENDING_DELETION') AS total_pending_deletion,
                COUNT(*) AS total_journals
            FROM journal_entries;
        `;

        const metricsResult = await db.query(metricsQuery);

        res.status(200).json({
            status: 'success',
            data: {
                overview: metricsResult.rows[0]
            }
        });
    } catch (error) {
        console.error('Admin Metrics Error:', error);
        res.status(500).json({ status: 'error', message: 'Gagal mengambil metrik sistem' });
    }
};

// 2. Observing: Audit Logs Telemetry
const getAuditLogs = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT id, reference_number, project_id, status, previous_status, is_balanced, created_by, maker_id, deletion_reason, deletion_requested_by, created_at, updated_at
            FROM journal_entries
            ORDER BY updated_at DESC
            LIMIT 50;
        `);

        res.status(200).json({
            status: 'success',
            data: result.rows
        });
    } catch (error) {
        console.error('Audit Logs Error:', error);
        res.status(500).json({ status: 'error', message: 'Gagal mengambil log audit' });
    }
};

// 3. Repairing: Emergency Override Status (Super Admin Only)
const overrideJournalStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { target_status, reason } = req.body;

        if (!target_status || !reason) {
            return res.status(400).json({ status: 'error', message: 'Target status dan alasan perbaikan wajib diisi' });
        }

        await db.query(
            `UPDATE journal_entries 
             SET status = $1, rejection_reason = $2, updated_at = NOW() 
             WHERE id = $3`,
            [target_status, `[SUPERADMIN OVERRIDE]: ${reason}`, id]
        );

        res.status(200).json({
            status: 'success',
            message: `Status jurnal ${id} berhasil di-override menjadi ${target_status}`
        });
    } catch (error) {
        console.error('Override Journal Error:', error);
        res.status(500).json({ status: 'error', message: 'Gagal melakukan override jurnal' });
    }
};

// 4. Governance: Memproses Pengajuan Penghapusan (Admin & Super Admin)
const processDeletionRequest = async (req, res) => {
    const client = await db.connect();
    try {
        const { id } = req.params;
        const { action, rejection_reason } = req.body; // 'APPROVE' atau 'REJECT'

        const checkResult = await client.query(
            'SELECT status, previous_status FROM journal_entries WHERE id = $1', 
            [id]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Jurnal tidak ditemukan.' });
        }

        const journal = checkResult.rows[0];

        if (journal.status !== 'PENDING_DELETION') {
            return res.status(400).json({ status: 'error', message: 'Jurnal tidak dalam status PENDING_DELETION.' });
        }

        await client.query('BEGIN');

        if (action === 'APPROVE') {
            // Hapus permanen rincian baris & header jurnal
            await client.query('DELETE FROM journal_entry_lines WHERE journal_id = $1', [id]);
            await client.query('DELETE FROM journal_entries WHERE id = $1', [id]);
            await client.query('COMMIT');

            return res.status(200).json({
                status: 'success',
                message: 'Pengajuan penghapusan disetujui. Data jurnal telah dihapus permanen.'
            });
        } else if (action === 'REJECT') {
            // Kembalikan status ke previous_status
            const revertStatus = journal.previous_status || 'DRAFT';
            
            await client.query(
                `UPDATE journal_entries 
                 SET status = $1, 
                     previous_status = NULL, 
                     deletion_reason = NULL, 
                     deletion_requested_by = NULL,
                     rejection_reason = $2, 
                     updated_at = NOW() 
                 WHERE id = $3`,
                [revertStatus, rejection_reason || 'Pengajuan penghapusan ditolak oleh Admin.', id]
            );
            await client.query('COMMIT');

            return res.status(200).json({
                status: 'success',
                message: `Pengajuan penghapusan ditolak. Status jurnal dikembalikan ke ${revertStatus}.`
            });
        } else {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'error', message: 'Aksi tidak valid (Gunakan APPROVE atau REJECT).' });
        }
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Process Deletion Error:', error);
        res.status(500).json({ status: 'error', message: 'Gagal memproses pengajuan penghapusan.' });
    } finally {
        client.release();
    }
};

module.exports = { getSystemMetrics, getAuditLogs, overrideJournalStatus, processDeletionRequest };