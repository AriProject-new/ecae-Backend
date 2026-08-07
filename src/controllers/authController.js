const db = require('../config/db');
const jwt = require('jsonwebtoken');

const login = async (req, res) => {
    const { username } = req.body;

    try {
        // Cek apakah user ada di database
        const result = await db.query('SELECT * FROM users WHERE username = $1', [username]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'User tidak ditemukan' });
        }
        
        const user = result.rows[0];

        // Generate JWT Token (Berlaku 8 jam)
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.status(200).json({ 
            status: 'success', 
            message: 'Login berhasil', 
            token: token, 
            data: { username: user.username, role: user.role } 
        });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
};

module.exports = { login };