const db = require('../config/db');
const crypto = require('crypto');
const fs = require('fs');

const uploadAttachment = async (req, res) => {
    const { journal_id } = req.body;
    const uploader_id = req.user.id;
    const file = req.file;

    if (!file) {
        return res.status(400).json({ status: 'error', message: 'File tidak ditemukan atau format ditolak' });
    }
    
    if (!journal_id) {
        fs.unlinkSync(file.path); // Hapus file dari storage jika request tidak valid
        return res.status(400).json({ status: 'error', message: 'ID Jurnal wajib disertakan' });
    }

    try {
        // 1. Menghasilkan SHA256 Hash dari file
        const fileBuffer = fs.readFileSync(file.path);
        const hashSum = crypto.createHash('sha256');
        hashSum.update(fileBuffer);
        const hexHash = hashSum.digest('hex');

        // 2. Menyimpan Metadata ke Database
        const result = await db.query(
            `INSERT INTO attachments (journal_entry_id, file_name, file_path, file_type, file_hash, uploaded_by) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [journal_id, file.originalname, file.path, file.mimetype, hexHash, uploader_id]
        );

        res.status(201).json({
            status: 'success',
            message: 'Berkas pendukung berhasil diunggah',
            data: {
                attachment_id: result.rows[0].id,
                file_hash: hexHash
            }
        });
    } catch (error) {
        // Rollback: Hapus file fisik jika gagal masuk database
        if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path); 
        }
        
        console.error('Upload Error:', error);
        
        if (error.code === '23505') {
            return res.status(400).json({ status: 'error', message: 'File yang persis sama (hash duplikat) sudah pernah diunggah ke dalam sistem.' });
        }
        res.status(500).json({ status: 'error', message: 'Gagal memproses unggahan dokumen' });
    }
};

module.exports = { uploadAttachment };