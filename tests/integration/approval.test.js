const request = require('supertest');
const app = require('../../src/server.js');
const db = require('../../src/config/db');

// Siapkan token untuk kedua Role
const MAKER_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyYzhjNGE3LWJiZmEtNGNlNC1iZmJjLTJhZTdmN2I0M2YzOCIsInVzZXJuYW1lIjoibWFrZXJfYXJpIiwicm9sZSI6Ik1ha2VyIiwiaWF0IjoxNzg1NDA3OTcyLCJleHAiOjE3ODU0MzY3NzJ9.FPa3UJd_0pnZV3kxOtvAhk_Cs5PZuF0HcZ-8JD_yXvQ';
const CHECKER_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjBhZjVkZGU1LWJlY2UtNGYzMC1hMGE4LTAzNWE4OGQ0YzM1YyIsInVzZXJuYW1lIjoiY2hlY2tlcl9idWRpIiwicm9sZSI6IkNoZWNrZXIiLCJpYXQiOjE3ODU0MDc5OTEsImV4cCI6MTc4NTQzNjc5MX0.Eg1whawoNyfMbPU6-89gw1e0ZWlicCrUX6RU34VQLLM';

describe('Approval Workflow & RBAC Tests', () => {
    let testJournalId; // Variabel untuk menyimpan ID Jurnal sementara antar-tes

    afterAll(async () => {
        await db.end();
    });

    it('1. Maker harus bisa membuat Draft Jurnal', async () => {
        const response = await request(app)
            .post('/api/ledger/draft')
            .set('Authorization', `Bearer ${MAKER_TOKEN}`)
            .send({
                reference_number: `WORKFLOW-${Date.now()}`,
                transaction_date: '2026-08-05',
                lines: [
                    { account_id: '33333333-3333-3333-3333-333333333333', debit: 75000, credit: 0 },
                    { account_id: '11111111-1111-1111-1111-111111111111', debit: 0, credit: 75000 }
                ]
            });

        expect(response.statusCode).toBe(201);
        testJournalId = response.body.data.journal_id; // Simpan ID untuk tes selanjutnya
        expect(testJournalId).toBeDefined();
    });

    it('2. Maker berhasil mengajukan jurnal (Menjadi PENDING_APPROVAL)', async () => {
        const response = await request(app)
            .post(`/api/approval/${testJournalId}/submit`)
            .set('Authorization', `Bearer ${MAKER_TOKEN}`);
        
        expect(response.statusCode).toBe(200);
        expect(response.body.message).toMatch(/berhasil diajukan/i);
    });

    it('3. Checker menolak Jurnal jika tanpa alasan (Harus Gagal)', async () => {
        const response = await request(app)
            .post(`/api/approval/${testJournalId}/process`)
            .set('Authorization', `Bearer ${CHECKER_TOKEN}`)
            .send({
                action: 'REJECT',
                rejection_reason: '' // Sengaja dikosongkan
            });
        
        expect(response.statusCode).toBe(400);
        expect(response.body.message).toMatch(/Alasan penolakan wajib diisi/i);
    });

    it('4. Checker berhasil menyetujui Jurnal (Menjadi POSTED)', async () => {
        const response = await request(app)
            .post(`/api/approval/${testJournalId}/process`)
            .set('Authorization', `Bearer ${CHECKER_TOKEN}`)
            .send({
                action: 'APPROVE'
            });
        
        expect(response.statusCode).toBe(200);
        expect(response.body.message).toMatch(/berhasil disetujui/i);
    });
});