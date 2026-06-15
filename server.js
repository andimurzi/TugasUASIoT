const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();

// 1. Pengaturan CORS yang sangat terbuka untuk Server Cloud
app.use(cors({
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
}));

// Mengaktifkan pembaca format JSON dan URL-Encoded dari ESP8266
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Buat HTTP server secara eksplisit (Wajib untuk Socket.io di Cloud)
const server = http.createServer(app);

// 2. Inisialisasi Socket.io dengan konfigurasi kecocokan Engine Cloud
const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true
});

const CSV_FILE = path.join(__dirname, 'data_sensor.csv');

// Jalur Web Static untuk Dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Endpoint untuk menerima data dari ESP8266 via HTTP POST
app.post('/api/data', (req, res) => {
    // PROTEKSI: Menerima data baik dari JSON (req.body) maupun parameter query URL (req.query)
    const water_level = req.body.water_level || req.query.water_level;
    const raw_value = req.body.raw_value || req.query.raw_value;
    
    // Ambil waktu lokal Jakarta/Semarang (WIB)
    const options = { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
    const timestamp = new Date().toLocaleTimeString('id-ID', options);
    
    const logData = {
        water_level: parseInt(water_level) !== undefined ? parseInt(water_level) : 0,
        raw_value: parseInt(raw_value) !== undefined ? parseInt(raw_value) : 0,
        timestamp: timestamp
    };
    
    console.log(`[ESP8266] Data Masuk -> Level: ${logData.water_level}%, Raw: ${logData.raw_value}`);
    
    // Tembakkan data real-time ke halaman Web browser via Socket.io
    io.emit('sensor-update', logData);
    
    // Simpan data ke berkas CSV sebagai riwayat histori grafik
    const csvLine = `${timestamp},${logData.water_level},${logData.raw_value}\n`;
    fs.appendFile(CSV_FILE, csvLine, (err) => {
        if (err) console.error("Gagal menulis ke file CSV:", err);
    });
    
    res.status(200).json({ status: 'success', message: 'Data berhasil diterima', data: logData });
});

// API Endpoint untuk memuat riwayat data awal di grafik chart
app.get('/api/history', (req, res) => {
    if (!fs.existsSync(CSV_FILE)) {
        return res.json([]);
    }
    
    fs.readFile(CSV_FILE, 'utf8', (err, data) => {
        if (err || !data) return res.status(500).json([]);
        
        // PROTEKSI: Memfilter baris kosong agar tidak merusak fungsi split data
        const lines = data.trim().split('\n').filter(line => line.trim() !== '');
        
        const history = lines.map(line => {
            const parts = line.split(',');
            if (parts.length < 3) return null;
            return {
                timestamp: parts[0],
                water_level: parseInt(parts[1]) || 0,
                raw_value: parseInt(parts[2]) || 0
            };
        }).filter(item => item !== null); // Buang data yang rusak jika ada
        
        // Batasi hanya mengambil 15 data terakhir agar grafik tidak terlalu padat
        res.json(history.slice(-15));
    });
});

// 3. Penyetelan Port Dinamis Otomatis Railway (Gunakan 0.0.0.0)
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`===================================================`);
    console.log(` Server IoT Berjalan Sukses di Port: ${PORT}`);
    console.log(`===================================================`);
});