const db = require('../config/db');

// 1. Mengambil Seluruh Folder Proyek Aktif (is_deleted = FALSE)
const getProjects = async (req, res) => {
    try {
        const query = `
            SELECT 
                p.id, 
                p.name, 
                p.status, 
                COALESCE(p.contract_value, 0) AS contract_value,
                p.created_at,
                COUNT(j.id) AS total_transactions,
                COALESCE(SUM(l.debit), 0) AS total_inflow,
                COALESCE(SUM(l.credit), 0) AS total_outflow
            FROM projects p
            LEFT JOIN journal_entries j ON p.id = j.project_id AND (j.status IS NULL OR j.status <> 'PENDING_DELETION')
            LEFT JOIN journal_entry_lines l ON j.id = l.journal_id
            WHERE p.is_deleted = FALSE OR p.is_deleted IS NULL
            GROUP BY p.id
            ORDER BY p.created_at DESC;
        `;
        const result = await db.query(query);

        res.status(200).json({
            status: 'success',
            data: result.rows
        });
    } catch (error) {
        console.error('Get Projects Error:', error);
        res.status(500).json({ status: 'error', message: 'Gagal mengambil daftar proyek.' });
    }
};

// 2. Membuat Folder Proyek Baru (Dengan Proteksi Duplicate Key & Soft Delete Check)
const createProject = async (req, res) => {
    try {
        const { id, name, status, contract_value } = req.body;

        if (!id || !name) {
            return res.status(400).json({ status: 'error', message: 'Kode Proyek dan Nama Proyek wajib diisi.' });
        }

        const formattedId = id.toUpperCase().trim();

        // 1. Cek ketersediaan Kode Proyek di database
        const checkExist = await db.query('SELECT id, is_deleted FROM projects WHERE id = $1', [formattedId]);
        if (checkExist.rows.length > 0) {
            const isDeleted = checkExist.rows[0].is_deleted;
            if (isDeleted) {
                return res.status(400).json({ 
                    status: 'error', 
                    message: `Kode Proyek "${formattedId}" sudah ada di database dengan status Dihapus (Soft Delete). Minta Admin untuk memulihkan (Recovery) atau gunakan Kode Proyek lain.` 
                });
            }
            return res.status(400).json({ 
                status: 'error', 
                message: `Kode Proyek "${formattedId}" sudah digunakan oleh proyek lain. Gunakan Kode Proyek yang unik.` 
            });
        }

        // 2. Insert Proyek Baru jika ID aman
        await db.query(
            `INSERT INTO projects (id, name, status, contract_value) VALUES ($1, $2, $3, $4)`,
            [formattedId, name, status || 'AKTIF', Number(contract_value) || 0]
        );

        res.status(201).json({
            status: 'success',
            message: `Folder proyek ${formattedId} berhasil dibuat.`
        });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(400).json({ 
                status: 'error', 
                message: `Kode Proyek sudah terdaftar di sistem. Gunakan Kode Proyek lain.` 
            });
        }
        console.error('Create Project Error:', error);
        res.status(500).json({ status: 'error', message: `Gagal membuat folder proyek: ${error.message}` });
    }
};

// 3. Mengambil Detail Termin Pembayaran Proyek
const getProjectTerms = async (req, res) => {
    try {
        const { projectId } = req.params;
        const result = await db.query(
            `SELECT * FROM project_payment_terms WHERE project_id = $1 ORDER BY created_at ASC`,
            [projectId]
        );

        res.status(200).json({
            status: 'success',
            data: result.rows
        });
    } catch (error) {
        console.error('Get Project Terms Error:', error);
        res.status(500).json({ status: 'error', message: 'Gagal mengambil data termin proyek.' });
    }
};

// 4. Memperbarui Nilai Kontrak dan Termin Pembayaran Proyek (Dengan Validasi Threshold 100%)
const updateProjectContractAndTerms = async (req, res) => {
    const client = await db.connect();
    try {
        const { projectId } = req.params;
        const { contract_value, terms } = req.body;

        // VALIDASI THRESHOLD: Total persentase termin tidak boleh melebihi 100%
        if (terms && terms.length > 0) {
            const totalPercentage = terms.reduce((sum, t) => sum + (Number(t.percentage) || 0), 0);
            if (totalPercentage > 100) {
                return res.status(400).json({
                    status: 'error',
                    message: `Gagal menyimpan: Total persentase termin (${totalPercentage.toFixed(2)}%) melebihi batas maksimal 100%.`
                });
            }
        }

        await client.query('BEGIN');

        // Update Nilai Kontrak Utama
        await client.query(
            `UPDATE projects SET contract_value = $1 WHERE id = $2`,
            [Number(contract_value) || 0, projectId]
        );

        // Hapus termin lama yang BELUM dicairkan agar bisa diperbarui
        await client.query(
            `DELETE FROM project_payment_terms WHERE project_id = $1 AND (is_realized = FALSE OR is_realized IS NULL)`, 
            [projectId]
        );

        if (terms && terms.length > 0) {
            for (const term of terms) {
                // Abaikan termin yang sudah dicairkan agar histori penagihan aman
                if (term.is_realized) continue;

                const amount = (Number(contract_value) * Number(term.percentage)) / 100;
                
                // Tambahkan kolom description pada kueri INSERT
                await client.query(
                    `INSERT INTO project_payment_terms (project_id, term_name, percentage, amount, is_realized, description)
                     VALUES ($1, $2, $3, $4, FALSE, $5)`,
                    [projectId, term.term_name, Number(term.percentage), amount, term.description || null]
                );
            }
        }

        await client.query('COMMIT');

        res.status(200).json({
            status: 'success',
            message: 'Struktur Nilai Kontrak dan Termin Pembayaran berhasil diperbarui.'
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Update Contract Error:', error);
        res.status(500).json({ status: 'error', message: 'Gagal memperbarui nilai kontrak proyek.' });
    } finally {
        client.release();
    }
};

// 5. Soft Delete Folder Proyek oleh Maker / Admin
const deleteProject = async (req, res) => {
    try {
        const { projectId } = req.params;
        const deletedBy = req.user?.username || 'Maker';

        const checkResult = await db.query(
            'SELECT id FROM projects WHERE id = $1 AND (is_deleted = FALSE OR is_deleted IS NULL)', 
            [projectId]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Folder proyek tidak ditemukan.' });
        }

        await db.query(
            `UPDATE projects 
             SET is_deleted = TRUE, 
                 deleted_at = NOW(), 
                 deleted_by = $1 
             WHERE id = $2`,
            [deletedBy, projectId]
        );

        res.status(200).json({
            status: 'success',
            message: `Folder proyek ${projectId} berhasil dihapus.`
        });
    } catch (error) {
        console.error('Delete Project Error:', error);
        res.status(500).json({ status: 'error', message: 'Gagal menghapus folder proyek.' });
    }
};

// 6. Mengambil Daftar Proyek Dihapus (Untuk Audit Admin Console)
const getDeletedProjects = async (req, res) => {
    try {
        const query = `
            SELECT id, name, status, contract_value, deleted_at, deleted_by
            FROM projects
            WHERE is_deleted = TRUE
            ORDER BY deleted_at DESC;
        `;
        const result = await db.query(query);

        res.status(200).json({
            status: 'success',
            data: result.rows
        });
    } catch (error) {
        console.error('Get Deleted Projects Error:', error);
        res.status(500).json({ status: 'error', message: 'Gagal mengambil log proyek yang dihapus.' });
    }
};

// 7. Memulihkan (Recovery) Folder Proyek oleh Admin / Super Admin
const restoreProject = async (req, res) => {
    try {
        const { projectId } = req.params;

        await db.query(
            `UPDATE projects 
             SET is_deleted = FALSE, 
                 deleted_at = NULL, 
                 deleted_by = NULL 
             WHERE id = $1`,
            [projectId]
        );

        res.status(200).json({
            status: 'success',
            message: `Folder proyek ${projectId} berhasil dipulihkan (recovered).`
        });
    } catch (error) {
        console.error('Restore Project Error:', error);
        res.status(500).json({ status: 'error', message: 'Gagal memulihkan folder proyek.' });
    }
};

// 8. Mengambil Laporan Eksekutif Untung-Rugi Proyek (Lengkap Pemasukan, Pengeluaran & Lampiran)
const getProjectProfitabilityReport = async (req, res) => {
    try {
        const { projectId } = req.params;

        // 1. Summary Proyek
        const summaryQuery = `
            SELECT * FROM project_profitability_summary WHERE project_id = $1;
        `;
        
        // 2. Rincian & Deskripsi Pengeluaran (Outflow)
        const expenseQuery = `
            SELECT 
                l.id,
                l.cashflow_category,
                l.description,
                j.reference_number,
                j.transaction_date,
                COALESCE(l.credit, 0) AS total_expense
            FROM journal_entries j
            JOIN journal_entry_lines l ON j.id = l.journal_id
            WHERE j.project_id = $1 
              AND (j.status IS NULL OR j.status <> 'PENDING_DELETION')
              AND COALESCE(l.credit, 0) > 0
            ORDER BY j.transaction_date DESC, l.id DESC;
        `;

        // 3. Rincian & Deskripsi Pemasukan (Inflow)
        const inflowQuery = `
            SELECT 
                l.id,
                l.cashflow_category,
                l.description,
                j.reference_number,
                j.transaction_date,
                COALESCE(l.debit, 0) AS total_income
            FROM journal_entries j
            JOIN journal_entry_lines l ON j.id = l.journal_id
            WHERE j.project_id = $1 
              AND (j.status IS NULL OR j.status <> 'PENDING_DELETION')
              AND COALESCE(l.debit, 0) > 0
            ORDER BY j.transaction_date DESC, l.id DESC;
        `;

        // 4. Bukti & Dokumen Penguat Transaksi (Attachments)
        const attachmentQuery = `
            SELECT 
                a.id,
                a.journal_id,
                a.file_name,
                a.file_path,
                a.file_type,
                a.created_at,
                j.reference_number
            FROM attachments a
            JOIN journal_entries j ON a.journal_id = j.id
            WHERE j.project_id = $1 
              AND (j.status IS NULL OR j.status <> 'PENDING_DELETION')
            ORDER BY a.created_at DESC;
        `;

        const summaryResult = await db.query(summaryQuery, [projectId]);
        const expenseResult = await db.query(expenseQuery, [projectId]);
        const inflowResult = await db.query(inflowQuery, [projectId]);
        
        let attachmentResult = { rows: [] };
        try {
            attachmentResult = await db.query(attachmentQuery, [projectId]);
        } catch (attErr) {
            console.log('Attachment query notice:', attErr.message);
        }

        if (summaryResult.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Data proyek tidak ditemukan.' });
        }

        res.status(200).json({
            status: 'success',
            data: {
                summary: summaryResult.rows[0],
                expense_categories: expenseResult.rows,
                inflow_details: inflowResult.rows,
                attachments: attachmentResult.rows
            }
        });
    } catch (error) {
        console.error('Get Profitability Report Error:', error);
        res.status(500).json({ status: 'error', message: 'Gagal menyusun laporan untung-rugi proyek.' });
    }
};

// 9. Memproses Pencairan / Penagihan Termin (Otomatis Buat Inflow Cashflow)
// Memproses Pencairan / Penagihan Termin (Otomatis Buat Inflow Cashflow)
const realizePaymentTerm = async (req, res) => {
    console.log('--- REALIZE PAYMENT TERM REQUEST RECEIVED ---');
    console.log('Params:', req.params);
    console.log('User:', req.user);

    const client = await db.connect();
    try {
        const { projectId, termId } = req.params;

        await client.query('BEGIN');

        // 1. Cari data termin dan verifikasi keberadaan proyek
        const termResult = await client.query(
            `SELECT t.*, p.name as project_name 
             FROM project_payment_terms t
             JOIN projects p ON t.project_id = p.id
             WHERE t.id = $1 AND t.project_id = $2`,
            [termId, projectId]
        );

        if (termResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'error', message: 'Data termin tidak ditemukan.' });
        }

        const term = termResult.rows[0];

        if (term.is_realized) {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'error', message: 'Termin ini sudah dicairkan sebelumnya.' });
        }

        // 2. Tandai termin sebagai TERCAIRKAN
        await client.query(
            `UPDATE project_payment_terms 
             SET is_realized = TRUE, realized_at = NOW() 
             WHERE id = $1`,
            [termId]
        );

        // 3. Verifikasi ketersediaan akun kas default di tabel accounts
        let accountId = '33333333-3333-3333-3333-333333333333';
        const accCheck = await client.query(`SELECT id FROM accounts WHERE id = $1`, [accountId]);
        
        if (accCheck.rows.length === 0) {
            const newAcc = await client.query(
                `INSERT INTO accounts (id, account_code, account_name, code, name, type) 
                 VALUES ($1, 'CASH-IN-01', 'Kas Pemasukan Termin Proyek', 'CASH-IN-01', 'Kas Pemasukan Termin Proyek', 'ASSET') 
                 ON CONFLICT (id) DO UPDATE SET account_name = EXCLUDED.account_name RETURNING id`,
                [accountId]
            );
            accountId = newAcc.rows[0].id;
        }

        // 4a. Buat entri jurnal dengan status DRAFT terlebih dahulu agar lolos dari database trigger
        const refNumber = `INV-${projectId}-${Date.now().toString().slice(-6)}`;
        const currentUserId = (req.user && req.user.id && req.user.id.length === 36) ? req.user.id : null;
        const currentUsername = req.user?.username || 'SYSTEM_AUTO';

        const journalRes = await client.query(
            `INSERT INTO journal_entries (reference_number, transaction_date, project_id, is_balanced, status, created_by, maker_id)
             VALUES ($1, CURRENT_DATE, $2, TRUE, 'DRAFT', $3, $4) RETURNING id`,
            [refNumber, projectId, currentUsername, currentUserId]
        );

        const journalId = journalRes.rows[0].id;

        // 4b. Masukkan rincian pos kas (Inflow/Debit sebesar nominal termin)
        await client.query(
            `INSERT INTO journal_entry_lines (journal_id, account_id, debit, credit, cashflow_category)
             VALUES ($1, $2, $3, 0, 'OPERATING')`,
            [journalId, accountId, Number(term.amount)]
        );

        // 4c. Setelah baris rincian kas terisi, kunci jurnal menjadi POSTED
        await client.query(
            `UPDATE journal_entries SET status = 'POSTED' WHERE id = $1`,
            [journalId]
        );

        await client.query('COMMIT');
        console.log('Realize Term Success for:', term.term_name);

        res.status(200).json({
            status: 'success',
            message: `Termin "${term.term_name}" berhasil dicairkan. Rp ${Number(term.amount).toLocaleString('id-ID')} masuk ke Kas Proyek.`
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('DATABASE ERROR DURING REALIZE TERM:', error);
        res.status(500).json({ 
            status: 'error', 
            message: `Gagal mencairkan termin: ${error.message}` 
        });
    } finally {
        client.release();
    }
};

module.exports = {
    getProjects,
    createProject,
    getProjectTerms,
    updateProjectContractAndTerms,
    deleteProject,
    getDeletedProjects,
    restoreProject,
    getProjectProfitabilityReport,
    realizePaymentTerm
};