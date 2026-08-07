const request = require('supertest');
const app = require('../../src/server.js');
const db = require('../../src/config/db');

// Gunakan Token Maker yang valid (Ganti teks di bawah dengan token Maker aslimu)
const MAKER_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyYzhjNGE3LWJiZmEtNGNlNC1iZmJjLTJhZTdmN2I0M2YzOCIsInVzZXJuYW1lIjoibWFrZXJfYXJpIiwicm9sZSI6Ik1ha2VyIiwiaWF0IjoxNzg1NDA3Nzg0LCJleHAiOjE3ODU0MzY1ODR9.wRjbJcaWN9xXLtePdzBIPv1AE3eknjPMS_QxQR-g1vs'; 

describe('Ledger Integration Tests (Double-Entry Validation)', () => {
    
    // Tutup koneksi database setelah semua tes selesai agar terminal tidak menggantung
    afterAll(async () => {
        await db.end();
    });

    it('Harus menolak Jurnal jika total Debit dan Kredit tidak seimbang', async () => {
        const response = await request(app)
            .post('/api/ledger/draft')
            .set('Authorization', `Bearer ${MAKER_TOKEN}`)
            .send({
                reference_number: `TEST-JRN-${Date.now()}`,
                transaction_date: '2026-08-01',
                lines: [
                    {
                        account_id: '33333333-3333-3333-3333-333333333333',
                        debit: 100000,
                        credit: 0
                    },
                    {
                        account_id: '11111111-1111-1111-1111-111111111111',
                        debit: 0,
                        credit: 90000 // Selisih 10.000
                    }
                ]
            });

        // Ekspektasi: Server harus mengembalikan status 400 Bad Request
        expect(response.statusCode).toBe(400);
        // Ekspektasi: Pesan error harus mengandung peringatan ketidakseimbangan
        expect(response.body.message).toMatch(/Jurnal tidak seimbang/i);
    });

    it('Harus berhasil membuat DRAFT jika Debit dan Kredit seimbang', async () => {
        const response = await request(app)
            .post('/api/ledger/draft')
            .set('Authorization', `Bearer ${MAKER_TOKEN}`)
            .send({
                reference_number: `TEST-JRN-${Date.now()}`,
                transaction_date: '2026-08-01',
                lines: [
                    {
                        account_id: '33333333-3333-3333-3333-333333333333',
                        debit: 100000,
                        credit: 0
                    },
                    {
                        account_id: '11111111-1111-1111-1111-111111111111',
                        debit: 0,
                        credit: 100000
                    }
                ]
            });

        // Ekspektasi: Server harus mengembalikan status 201 Created
        expect(response.statusCode).toBe(201);
        expect(response.body.status).toBe('success');
        expect(response.body.data).toHaveProperty('journal_id');
        expect(response.body.data.status).toBe('DRAFT');
    });
});