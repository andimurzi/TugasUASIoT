const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// GANTI BARIS INI (Sangat Penting untuk Railway)
const PORT = process.env.PORT || 3500;
const CSV_FILE = "data_sensor.csv";

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Cek apakah file CSV sudah ada, jika belum buat file baru beserta headernya
if (!fs.existsSync(CSV_FILE)) {
  fs.writeFileSync(CSV_FILE, "Timestamp,Raw_Value,Water_Level_Pct\n");
}

// 1. ENDPOINT POST: Menerima data dari ESP8266 & Simpan ke CSV
app.post("/api/data", (req, res) => {
  const { water_level, raw_value } = req.body;

  if (water_level === undefined || raw_value === undefined) {
    return res
      .status(400)
      .json({ status: "error", message: "Data tidak lengkap" });
  }

  const timestamp = new Date().toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  // Susun baris data CSV
  const barisDataCSV = `${timestamp},${raw_value},${water_level}\n`;

  // Simpan ke file CSV
  fs.appendFile(CSV_FILE, barisDataCSV, (err) => {
    if (err) console.error("Gagal menulis ke CSV:", err);
  });

  // Kirim data real-time ke web utama lewat Socket.io
  io.emit("sensor-update", {
    water_level: parseInt(water_level),
    raw_value: parseInt(raw_value),
    timestamp,
  });

  console.log(
    `[ESP8266] Data Masuk -> Level: ${water_level}%, Raw: ${raw_value}`,
  );

  // Set header agar koneksi langsung disudahi dengan bersih setelah merespon
  res.setHeader("Connection", "close");
  res.status(200).json({ status: "success", message: "Data terlog di CSV" });
});

// 2. ENDPOINT GET: Membaca isi CSV untuk grafik awal Dashboard Web agar tidak kosong
app.get("/api/history", (req, res) => {
  if (!fs.existsSync(CSV_FILE)) {
    return res.json([]);
  }

  try {
    const dataCSV = fs.readFileSync(CSV_FILE, "utf-8");
    const baris = dataCSV.trim().split("\n");
    const dataLog = [];

    // Looping data (Lewati baris index 0 karena itu header/judul kolom)
    for (let i = 1; i < baris.length; i++) {
      const kolom = baris[i].split(",");
      if (kolom.length === 3) {
        dataLog.push({
          timestamp: kolom[0],
          raw_value: parseInt(kolom[1]),
          water_level: parseInt(kolom[2]),
        });
      }
    }

    // Kirim 15 data terakhir ke dashboard web kamu
    res.json(dataLog.slice(-15));
  } catch (error) {
    console.error("Gagal membaca history CSV:", error);
    res.status(500).json({ message: "Gagal membaca riwayat data" });
  }
});

// Membuka server ke IP "0.0.0.0" agar bisa diakses oleh ESP8266 dari Wi-Fi luar
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server IoT Berjalan di Port: ${PORT}`);
  console.log(`===================================================`);
  console.log(` Server IoT Berjalan di http://localhost:${PORT}`);
  console.log(` Siap menerima data di http://192.168.100.62:${PORT}/api/data`);
  console.log(`===================================================`);
});
