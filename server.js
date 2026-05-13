const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose'); 

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 1. CẤU HÌNH DATABASE ---
const mongoURI = "mongodb+srv://admin:VCC12345@cluster0.yaz7fki.mongodb.net/TramGiamSatIOT?retryWrites=true&w=majority";
mongoose.connect(mongoURI)
    .then(() => console.log("🚀 [DB] Connected to MongoDB Atlas!"))
    .catch(err => console.error("❌ [DB] Connection error:", err));

const sensorSchema = new mongoose.Schema({
    nhiet_do: Number,
    do_am: Number,
    khi_gas: Number,
    canh_bao: Boolean,
    thoi_gian: { type: Date, default: Date.now }
});
const SensorLog = mongoose.model('SensorLog', sensorSchema);

// --- 2. CẤU HÌNH HỆ THỐNG (THÊM ĐIỀU KHIỂN) ---
let config = {
    tempThreshold: 35.0,
    gasThreshold: 2000,
    buzzerEnabled: true,  // Trạng thái bật/tắt còi
    ledEnabled: true      // Trạng thái bật/tắt LED
};

// --- 3. ĐIỀU HƯỚNG GIAO DIỆN ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/view-history', (req, res) => res.sendFile(path.join(__dirname, 'history.html')));

// API lấy lịch sử cho giao diện Log
app.get('/history', async (req, res) => {
    try {
        const logs = await SensorLog.find().sort({ thoi_gian: -1 }).limit(100);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: "Lỗi lấy dữ liệu" });
    }
});

// ESP32 gọi cái này để biết có được hú còi hay bật LED không
app.get('/get-config', (req, res) => res.json(config));

// --- 4. XỬ LÝ DỮ LIỆU TỪ ESP32 ---
app.post('/update', async (req, res) => {
    const data = req.body;
    console.log(`📥 [INCOMING] T: ${data.nhiet_do} | G: ${data.khi_gas} | Alert: ${data.canh_bao}`);

    try {
        const isAlertStatus = (data.canh_bao === true || data.canh_bao === "true");
        const newLog = new SensorLog({
            nhiet_do: data.nhiet_do,
            do_am: data.do_am,
            khi_gas: data.khi_gas,
            canh_bao: isAlertStatus
        });
        await newLog.save();
    } catch (dbErr) {
        console.error("❌ [DB ERROR]:", dbErr.message);
    }

    io.emit('sensor_data', data); 
    res.status(200).send("OK");
});

// --- 5. GIAO TIẾP REAL-TIME (SOCKET.IO) ---
io.on('connection', (socket) => {
    socket.emit('current_config', config);

    // Lắng nghe lệnh từ giao diện Web
    socket.on('update_settings', (newSettings) => {
        // Cập nhật ngưỡng và trạng thái thiết bị
        config.tempThreshold = parseFloat(newSettings.temp) || config.tempThreshold;
        config.gasThreshold = parseInt(newSettings.gas) || config.gasThreshold;
        config.buzzerEnabled = newSettings.buzzer;
        config.ledEnabled = newSettings.led;

        console.log(`⚙️ [CONFIG] New Settings: Buzzer=${config.buzzerEnabled}, LED=${config.ledEnabled}`);
        
        // Gửi lại cho tất cả các máy khách khác
        io.emit('current_config', config);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SERVER RUNNING AT PORT: ${PORT}`);
});
