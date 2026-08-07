const fs = require('fs');
const csv = require('csv-parser');
const db = require('../config/db');

const reconcileCSV = async (req, res) => {
    const file = req.file;

    if (!file || file.mimetype !== 'text/csv') {
        if (file) fs.unlinkSync(file.path);
        return res.status(400).json({ status: 'error', message: 'File wajib berformat CSV' });
    }

    const results = [];
    const matched = [];
    const unmatched = [];

    // Membaca file CSV
    fs.createReadStream(file.path)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            try {
                // Algoritma Pencocokan
                for (const row of results) {
                    const amount = parseFloat(row.amount); // Asumsi CSV memiliki kolom "amount"

                    if (isNaN(amount)) continue;

                    // Mencari jurnal berstatus POSTED yang memiliki nilai Debit atau Kredit persis dengan amount di CSV
                    const query = `
                        SELECT je.reference_number, je.transaction_date, jel.debit, jel.credit 
                        FROM journal_entry_lines jel
                        JOIN journal_entries je ON jel.journal_entry_id = je.id
                        WHERE (jel.debit = $1 OR jel.credit = $1)
                        AND je.status = 'POSTED'
                        LIMIT 1
                    `;
                    
                    const dbRes = await db.query(query, [amount]);
                    
                    if (dbRes.rows.length > 0) {
                        matched.push({ 
                            csv_data: row, 
                            system_match: dbRes.rows[0] 
                        });
                    } else {
                        unmatched.push(row);
                    }
                }

                // Hapus file fisik setelah selesai dibaca
                fs.unlinkSync(file.path);

                res.status(200).json({
                    status: 'success',
                    message: 'Rekonsiliasi Bank Selesai',
                    data: {
                        total_rows_processed: results.length,
                        matched_count: matched.length,
                        unmatched_count: unmatched.length,
                        matched_details: matched,
                        unmatched_details: unmatched
                    }
                });
            } catch (error) {
                console.error('Reconciliation Error:', error);
                if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
                res.status(500).json({ status: 'error', message: 'Gagal memproses rekonsiliasi' });
            }
        });
};

module.exports = { reconcileCSV };