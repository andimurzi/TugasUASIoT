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
    const { water_level, raw_value } = req.body;
    
    // Ambil waktu lokal Jakarta/Semarang (WIB)
    const options = { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
    const timestamp = new Date().toLocaleTimeString('id-ID', options);
    
    const logData = {
        water_level: parseInt(water_level) || 0,
        raw_value: parseInt(raw_value) || 0,
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
    
    res.status(200).json({ status: 'success', message: 'Data berhasil diterima' });
});

// API Endpoint untuk memuat riwayat data awal di grafik chart
app.get('/api/history', (req, res) => {
    if (!fs.existsSync(CSV_FILE)) {
        return res.json([]);
    }
    
    fs.readFile(CSV_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).json([]);
        
        const lines = data.trim().split('\n');
        const history = lines.map(line => {
            const [timestamp, water_level, raw_value] = line.split(',');
            return {
                timestamp,
                water_level: parseInt(water_level) || 0,
                raw_value: parseInt(raw_value) || 0
            };
        });
        
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