const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const nodemailer = require('nodemailer'); 
const mongoose = require('mongoose'); 

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 1. CẤU HÌNH DATABASE (MONGODB ATLAS) ---
const mongoURI = "mongodb+srv://admin:VCC12345@cluster0.yaz7fki.mongodb.net/TramGiamSatIOT?retryWrites=true&w=majority";

mongoose.connect(mongoURI)
    .then(() => console.log("🚀 [DATABASE] Kết nối thành công với MongoDB Atlas!"))
    .catch(err => console.error("❌ [DATABASE] Lỗi kết nối:", err));

const sensorSchema = new mongoose.Schema({
    nhiet_do: Number,
    do_am: Number,
    khi_gas: Number,
    canh_bao: Boolean,
    thoi_gian: { type: Date, default: Date.now }
});

const SensorLog = mongoose.model('SensorLog', sensorSchema);

// --- 2. CẤU HÌNH EMAIL ---
let config = { tempThreshold: 35.0, gasThreshold: 2000 };
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, 
    auth: { 
        user: 'vccong2710@gmail.com', 
        pass: 'qqbnkijfqgtqktvn' // Đảm bảo đây là mật khẩu ứng dụng 16 ký tự
    },
    tls: { rejectUnauthorized: false }
});

let lastEmailSentTime = 0;

function sendAlertEmail(data) {
    // Đã bỏ chặn EMAIL_INTERVAL để phục vụ việc Demo gửi mail liên tục
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

    console.log("📨 [EMAIL] Đang tiến hành gửi thư cảnh báo...");

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log("❌ [EMAIL] Lỗi gửi thư thực tế: " + error.message);
        } else {
            console.log("✅ [EMAIL] Thư đã được gửi thành công!");
            lastEmailSentTime = Date.now();
        }
    });
}

// --- 3. CÁC ĐƯỜNG DẪN (ROUTES) ---

// Trang chủ
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Trang giao diện lịch sử
app.get('/view-history', (req, res) => {
    res.sendFile(path.join(__dirname, 'history.html'));
});

// Lấy dữ liệu JSON lịch sử
app.get('/history', async (req, res) => {
    try {
        const logs = await SensorLog.find().sort({ thoi_gian: -1 }).limit(100);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: "Lỗi lấy dữ liệu" });
    }
});

// ESP32 lấy ngưỡng cài đặt
app.get('/get-config', (req, res) => { res.json(config); });

// Nhận dữ liệu từ ESP32
app.post('/update', async (req, res) => {
    const data = req.body;
    
    // Log dữ liệu ra màn hình Render để theo dõi
    console.log(`📥 [DATA] Temp: ${data.nhiet_do} | Gas: ${data.khi_gas} | Cảnh báo: ${data.canh_bao}`);

    try {
        const isAlertStatus = (data.canh_bao === true || data.canh_bao === "true");
        const newLog = new SensorLog({
            nhiet_do: data.nhiet_do,
            do_am: data.do_am,
            khi_gas: data.khi_gas,
            canh_bao: isAlertStatus
        });
        await newLog.save();
        console.log("💾 [DB] Đã lưu bản ghi thành công.");

        if (isAlertStatus) {
            sendAlertEmail(data);
        }
    } catch (dbErr) { 
        console.error("❌ [DB ERROR]:", dbErr.message); 
    }

    io.emit('sensor_data', data); 
    res.status(200).send("OK");
});

// --- 4. SOCKET.IO ---
io.on('connection', (socket) => {
    console.log("🌐 [SOCKET] Một thiết bị vừa kết nối.");
    socket.emit('current_config', config);
    socket.on('set_threshold', (newConfig) => {
        config.tempThreshold = parseFloat(newConfig.temp);
        config.gasThreshold = parseInt(newConfig.gas);
        console.log(`⚙️ [CONFIG] Cập nhật ngưỡng: Temp > ${config.tempThreshold}, Gas > ${config.gasThreshold}`);
        io.emit('current_config', config);
    });
});

// --- 5. KHỞI CHẠY ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 ============================================`);
    console.log(`🚀 SERVER ĐANG CHẠY TẠI PORT: ${PORT}`);
    console.log(`🚀 ============================================\n`);
});
