const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./config/db');
const ledgerRoutes = require('./routes/ledgerRoutes');
const approvalRoutes = require('./routes/approvalRoutes');
const periodRoutes = require('./routes/periodRoutes');
const attachmentRoutes = require('./routes/attachmentRoutes');
const reconciliationRoutes = require('./routes/reconciliationRoutes');
const projectRoutes = require('./routes/projectRoutes');

// Import Routes
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/ledger', ledgerRoutes);
app.use('/api/approval', approvalRoutes);
app.use('/api/period', periodRoutes);
app.use('/api/attachments', attachmentRoutes);
app.use('/api/reconciliation', reconciliationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/projects', projectRoutes);

app.get('/api/health', async (req, res) => {
    try {
        const result = await db.query('SELECT NOW() AS current_time');
        res.status(200).json({
            status: 'success',
            message: 'ECAE Backend is running',
            database_time: result.rows[0].current_time
        });
    } catch (error) {
        console.error('Database connection error:', error);
        res.status(500).json({ status: 'error', message: 'Database connection failed' });
    }
});

if (require.main === module) {
    app.listen(port, () => {
        console.log(`Server is running on http://localhost:${port}`);
    });
}

// Ekspor app agar bisa digunakan oleh Supertest
module.exports = app;