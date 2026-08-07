const jwt = require('jsonwebtoken');
require('dotenv').config();

// Middleware untuk memverifikasi keaslian Token
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(403).json({ status: 'error', message: 'Token tidak disediakan' });
    }

    // Format header biasanya "Bearer <token>"
    const token = authHeader.split(" ")[1];
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Menyimpan data user (id, role) ke dalam request untuk dipakai di controller
        next();
    } catch (err) {
        return res.status(401).json({ status: 'error', message: 'Token tidak valid atau sudah kadaluarsa' });
    }
};

// Middleware untuk membatasi akses berdasarkan Role
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ 
                status: 'error', 
                message: `Akses ditolak. Role ${req.user.role} tidak memiliki izin.` 
            });
        }
        next();
    };
};

module.exports = { verifyToken, requireRole };