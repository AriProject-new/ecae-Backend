const db = require('../config/db');

const lockPeriod = async (req, res) => {
    const { year, month } = req.body;
    const checker_id = req.user.id;

    if (!year || !month || month < 1 || month > 12) {
        return res.status(400).json({ status: 'error', message: 'Format tahun atau bulan tidak valid' });
    }

    try {
        await db.query(
            'INSERT INTO locked_periods (period_year, period_month, locked_by) VALUES ($1, $2, $3)',
            [year, month, checker_id]
        );

        res.status(201).json({ 
            status: 'success', 
            message: `Periode ${month}-${year} berhasil dikunci.` 
        });
    } catch (error) {
        console.error('Lock Period Error:', error);
        
        // Error code 23505 adalah Duplicate Key di PostgreSQL
        if (error.code === '23505') {
            return res.status(400).json({ status: 'error', message: 'Periode ini sudah dikunci sebelumnya.' });
        }
        res.status(500).json({ status: 'error', message: 'Gagal mengunci periode' });
    }
};

module.exports = { lockPeriod };