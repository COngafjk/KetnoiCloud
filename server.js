const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const nodemailer = require('nodemailer'); 
const mongoose = require('mongoose'); 

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- CẤU HÌNH MIDDLEWARE ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 1. KẾT NỐI DATABASE (MONGODB ATLAS) ---
const mongoURI = "mongodb+srv://admin:VCC12345@cluster0.yaz7fki.mongodb.net/TramGiamSatIOT?retryWrites=true&w=majority";

mongoose.connect(mongoURI)
    .then(() => console.log("🚀 [DATABASE] Kết nối thành công với MongoDB Atlas!"))
    .catch(err => console.error("❌ [DATABASE] Lỗi kết nối:", err));

// Định nghĩa Schema (Cấu trúc dữ liệu)
const sensorSchema = new mongoose.Schema({
    nhiet_do: Number,
    do_am: Number,
    khi_gas: Number,
    canh_bao: Boolean,
    thoi_gian: { type: Date, default: Date.now }
});

const SensorLog = mongoose.model('SensorLog', sensorSchema);

// --- 2. CẤU HÌNH THÔNG SỐ & EMAIL CẢNH BÁO ---
let config = { tempThreshold: 35.0, gasThreshold: 2000 };
let lastEmailSentTime = 0;
const EMAIL_INTERVAL = 300000; // 5 phút gửi 1 lần tránh spam

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, 
    auth: { user: 'vccong2710@gmail.com', pass: 'qqbnkijfqgtqktvn' },
    tls: { rejectUnauthorized: false }
});

function sendAlertEmail(data) {
    const now = Date.now();
    if (now - lastEmailSentTime < EMAIL_INTERVAL) {
        console.log("⏳ [EMAIL] Đang trong thời gian chờ (5 phút), không gửi email mới.");
        return;
    }

    const mailOptions = {
        from: '"Hệ Thống IoT Cảnh Báo" <vccong2710@gmail.com>', 
        to: 'vccong2710@gmail.com', 
        subject: '⚠️ CẢNH BÁO: Phát hiện chỉ số vượt ngưỡng!',
        html: `<h2>⚠️ CẢNH BÁO NGUY HIỂM</h2>
               <p>Hệ thống ghi nhận thông số bất thường:</p>
               <ul>
                   <li>Nhiệt độ: <b>${data.nhiet_do}°C</b></li>
                   <li>Nồng độ Gas: <b>${data.khi_gas}</b></li>
               </ul>`
    };

    console.log("📨 [EMAIL] Đang gửi thư cảnh báo...");
    transporter.sendMail(mailOptions, (error) => {
        if (!error) {
            console.log("✅ [EMAIL] Thư đã được gửi thành công!");
            lastEmailSentTime = now;
        } else {
            console.log("❌ [EMAIL] Lỗi gửi thư:", error.message);
        }
    });
}

// --- 3. CÁC ROUTE ĐIỀU HƯỚNG GIAO DIỆN (GET) ---

// Trang chủ Dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Trang xem lịch sử (Giao diện bảng)
app.get('/view-history', (req, res) => {
    res.sendFile(path.join(__dirname, 'history.html'));
});

// Lấy 100 bản ghi mới nhất từ DB (Dạng JSON)
app.get('/history', async (req, res) => {
    try {
        const logs = await SensorLog.find().sort({ thoi_gian: -1 }).limit(100);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: "Lỗi lấy dữ liệu" });
    }
});

// ESP32 gọi route này để lấy ngưỡng cài đặt
app.get('/get-config', (req, res) => { res.json(config); });

// --- 4. XỬ LÝ DỮ LIỆU TỪ ESP32 (POST) ---
app.post('/update', async (req, res) => {
    const data = req.body;
    
    // In Log ra màn hình Render để theo dõi
    console.log(`\n📥 [DỮ LIỆU MỚI] Temp: ${data.nhiet_do}°C | Gas: ${data.khi_gas} | Cảnh báo: ${data.canh_bao}`);

    try {
        const isAlertStatus = (data.canh_bao === true || data.canh_bao === "true");
        
        // Lưu vào Database
        const newLog = new SensorLog({
            nhiet_do: data.nhiet_do,
            do_am: data.do_am,
            khi_gas: data.khi_gas,
            canh_bao: isAlertStatus
        });
        await newLog.save();
        console.log("💾 [DATABASE] Đã lưu bản ghi thành công.");

        // Nếu có cảnh báo thì gửi Email
        if (isAlertStatus) {
            sendAlertEmail(data);
        }
    } catch (dbErr) { 
        console.error("❌ [DATABASE] Lỗi khi xử lý:", dbErr.message); 
    }

    // Đẩy dữ liệu lên web qua Socket.io
    io.emit('sensor_data', data); 
    res.status(200).send("OK");
});

// --- 5. QUẢN LÝ KẾT NỐI SOCKET.IO ---
io.on('connection', (socket) => {
    console.log("🌐 [SOCKET] Có người dùng vừa kết nối giao diện.");
    socket.emit('current_config', config);

    socket.on('set_threshold', (newConfig) => {
        config.tempThreshold = parseFloat(newConfig.temp);
        config.gasThreshold = parseInt(newConfig.gas);
        console.log(`⚙️ [CONFIG] Đã cập nhật ngưỡng mới: Temp > ${config.tempThreshold}, Gas > ${config.gasThreshold}`);
        io.emit('current_config', config);
    });
});

// --- KHỞI CHẠY SERVER ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 ============================================`);
    console.log(`🚀 SERVER ĐANG CHẠY TẠI PORT: ${PORT}`);
    console.log(`🚀 TRUY CẬP: https://ketnoicloud.onrender.com`);
    console.log(`🚀 ============================================\n`);
});
