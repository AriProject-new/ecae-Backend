const db = require('../config/db');

// 1. Membuat atau Memperbarui Draft Cashflow Proyek (Maker)
const createJournalDraft = async (req, res) => {
    const client = await db.connect();
    try {
        const { reference_number, transaction_date, project_id, description, lines } = req.body;

        if (!reference_number || !transaction_date || !lines || lines.length === 0) {
            return res.status(400).json({ status: 'error', message: 'Nomor referensi, tanggal, dan minimal satu baris transaksi wajib diisi.' });
        }

        // Hitung total Inflow (Pemasukan) dan Outflow (Pengeluaran)
        const totalInflow = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
        const totalOutflow = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);

        const isBalanced = true;

        const makerId = req.user?.id || req.user?.username || 'maker_ari';
        const createdBy = req.user?.username || 'system';

        await client.query('BEGIN');

        // Insert Header Cashflow Proyek dengan deskripsi transaksi
        const journalResult = await client.query(
            `INSERT INTO journal_entries (reference_number, transaction_date, project_id, description, is_balanced, status, created_by, maker_id)
             VALUES ($1, $2, $3, $4, $5, 'DRAFT', $6, $7) RETURNING id`,
            [reference_number, transaction_date, project_id || 'GENERAL', description || null, isBalanced, createdBy, makerId]
        );

        const journalId = journalResult.rows[0].id;

        // Insert Rincian Baris Cashflow dengan deskripsi per item pengeluaran
        for (const line of lines) {
            await client.query(
                `INSERT INTO journal_entry_lines (journal_id, account_id, debit, credit, cashflow_category, description)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    journalId, 
                    line.account_id, 
                    Number(line.debit) || 0, 
                    Number(line.credit) || 0, 
                    line.cashflow_category || 'OPERATING',
                    line.description || null
                ]
            );
        }

        await client.query('COMMIT');

        res.status(201).json({
            status: 'success',
            message: 'Draft cashflow proyek berhasil disimpan ke dalam Library.',
            data: { 
                journal_id: journalId, 
                total_inflow: totalInflow, 
                total_outflow: totalOutflow 
            }
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Create Draft Cashflow Error:', error);
        res.status(500).json({ 
            status: 'error', 
            message: `Gagal menyimpan draft cashflow: ${error.message}` 
        });
    } finally {
        client.release();
    }
};

// 2. Mengambil Seluruh Perpustakaan Transaksi Kas Proyek
const getAllJournals = async (req, res) => {
    try {
        const query = `
            SELECT 
                j.id, 
                j.reference_number, 
                j.transaction_date, 
                j.project_id, 
                j.description,
                j.status, 
                j.previous_status,
                j.created_by,
                j.created_at,
                j.updated_at,
                COALESCE(SUM(l.debit), 0) AS total_inflow,
                COALESCE(SUM(l.credit), 0) AS total_outflow,
                JSON_AGG(
                    JSON_BUILD_OBJECT(
                        'id', l.id,
                        'account_id', l.account_id,
                        'debit', l.debit,
                        'credit', l.credit,
                        'cashflow_category', l.cashflow_category,
                        'description', l.description
                    )
                ) FILTER (WHERE l.id IS NOT NULL) AS lines
            FROM journal_entries j
            LEFT JOIN journal_entry_lines l ON j.id = l.journal_id
            GROUP BY j.id
            ORDER BY j.updated_at DESC;
        `;
        const result = await db.query(query);

        res.status(200).json({
            status: 'success',
            data: result.rows
        });
    } catch (error) {
        console.error('Get All Journals Error:', error);
        res.status(500).json({ status: 'error', message: 'Gagal mengambil perpustakaan cashflow' });
    }
};

module.exports = { createJournalDraft, getAllJournals };