const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose'); 
const axios = require('axios'); // THÊM MỚI: Thư viện để gửi request tới Telegram

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname))); // Cho phép truy cập các file tĩnh (html, css, js)

// --- THÊM MỚI: CẤU HÌNH TELEGRAM ---
// Hãy thay Token và Chat ID thật của bạn vào đây
const TELEGRAM_TOKEN = '8660866539:AAGc-VrsDHMp0VoPseCxSlWbavDbNPMpzHo'; 
const TELEGRAM_CHAT_ID = '8812456715'; 

async function sendTelegramAlert(message) {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    try {
        await axios.post(url, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'HTML'
        });
        console.log("✅ [TELEGRAM] Alert sent successfully!");
    } catch (error) {
        console.error("❌ [TELEGRAM ERROR]:", error.message);
    }
}

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

// --- 2. CẤU HÌNH HỆ THỐNG ---
let config = {
    tempThreshold: 35.0,
    gasThreshold: 2000,
    buzzerEnabled: true,  
    ledEnabled: true      
};

// --- 3. ĐIỀU HƯỚNG GIAO DIỆN ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/view-history', (req, res) => res.sendFile(path.join(__dirname, 'history.html')));

// API lấy lịch sử (giới hạn 100 bản ghi mới nhất)
app.get('/history', async (req, res) => {
    try {
        const logs = await SensorLog.find().sort({ thoi_gian: -1 }).limit(100);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: "Lỗi lấy dữ liệu từ database" });
    }
});

// ESP32 gọi cái này để lấy cấu hình (Threshold và trạng thái On/Off thiết bị)
app.get('/get-config', (req, res) => {
    res.json(config);
});

// --- 4. XỬ LÝ DỮ LIỆU TỪ ESP32 ---
app.post('/update', async (req, res) => {
    const data = req.body;
    
    // Log dữ liệu nhận được để kiểm tra trên console của Render/CMD
    console.log(`📥 [DATA] Temp: ${data.nhiet_do}°C | Gas: ${data.khi_gas} | Alert: ${data.canh_bao}`);

    try {
        // Đảm bảo kiểu dữ liệu boolean cho cảnh báo
        const isAlertStatus = String(data.canh_bao) === "true";
        
        const newLog = new SensorLog({
            nhiet_do: data.nhiet_do,
            do_am: data.do_am,
            khi_gas: data.khi_gas,
            canh_bao: isAlertStatus
        });
        
        await newLog.save();

        // --- THÊM MỚI: TỰ ĐỘNG GỬI TELEGRAM KHI CÓ CẢNH BÁO ---
        if (isAlertStatus) {
            const msg = `🚨 <b>CẢNH BÁO HỆ THỐNG IOT</b> 🚨\n\n` +
                        `🌡 Nhiệt độ: <b>${data.nhiet_do}°C</b>\n` +
                        `💧 Độ ẩm: <b>${data.do_am}%</b>\n` +
                        `🔥 Khí Gas: <b>${data.khi_gas}</b>\n` +
                        `⏰ Thời gian: ${new Date().toLocaleString('vi-VN')}`;
            sendTelegramAlert(msg);
        }
        
        // Gửi dữ liệu real-time tới giao diện Web
        io.emit('sensor_data', {
            ...data,
            canh_bao: isAlertStatus,
            thoi_gian: new Date()
        });
        
        res.status(200).send("Update Successful");
    } catch (dbErr) {
        console.error("❌ [DB ERROR]:", dbErr.message);
        res.status(500).send("Database Error");
    }
});

// --- 5. GIAO TIẾP REAL-TIME (SOCKET.IO) ---
io.on('connection', (socket) => {
    console.log(`🔌 [Web] New client connected: ${socket.id}`);
    
    // Gửi cấu hình hiện tại ngay khi Web vừa mở
    socket.emit('current_config', config);

    // Lắng nghe lệnh cập nhật từ giao diện Web (Nút Lưu hoặc Toggle On/Off)
    socket.on('update_settings', (newSettings) => {
        config.tempThreshold = parseFloat(newSettings.temp) || config.tempThreshold;
        config.gasThreshold = parseInt(newSettings.gas) || config.gasThreshold;
        
        // Cập nhật trạng thái cho phép thiết bị hoạt động
        if (newSettings.buzzer !== undefined) config.buzzerEnabled = newSettings.buzzer;
        if (newSettings.led !== undefined) config.ledEnabled = newSettings.led;

        console.log(`⚙️ [CONFIG] Updated: T_Thresh=${config.tempThreshold}, G_Thresh=${config.gasThreshold}, Buzzer=${config.buzzerEnabled}, LED=${config.ledEnabled}`);
        
        // Phát tán cấu hình mới tới TẤT CẢ các tab web đang mở để đồng bộ giao diện
        io.emit('current_config', config);
    });

    socket.on('disconnect', () => {
        console.log(`❌ [Web] Client disconnected`);
    });
});

// --- 6. KHỞI CHẠY SERVER ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log("-----------------------------------------");
    console.log(`🚀 SERVER IS ONLINE AT PORT: ${PORT}`);
    console.log(`🏠 Local Access: http://localhost:${PORT}`);
    console.log("-----------------------------------------");
});
