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

// --- CẤU HÌNH DATABASE ---
const mongoURI = "mongodb+srv://admin:VCC12345@cluster0.yaz7fki.mongodb.net/TramGiamSatIOT?retryWrites=true&w=majority";

mongoose.connect(mongoURI)
    .then(() => console.log("🚀 Đã kết nối thành công với MongoDB Atlas!"))
    .catch(err => console.error("❌ Lỗi kết nối Database:", err));

const sensorSchema = new mongoose.Schema({
    nhiet_do: Number,
    do_am: Number,
    khi_gas: Number,
    canh_bao: Boolean,
    thoi_gian: { type: Date, default: Date.now }
});

const SensorLog = mongoose.model('SensorLog', sensorSchema);

// --- CẤU HÌNH EMAIL ---
let config = { tempThreshold: 35.0, gasThreshold: 2000 };
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, 
    auth: { user: 'vccong2710@gmail.com', pass: 'qqbnkijfqgtqktvn' },
    tls: { rejectUnauthorized: false }
});

let lastEmailSentTime = 0;
const EMAIL_INTERVAL = 300000; 

function sendAlertEmail(data) {
    const now = Date.now();
    if (now - lastEmailSentTime < EMAIL_INTERVAL) return;

    const mailOptions = {
        from: '"Hệ Thống IoT Cảnh Báo" <vccong2710@gmail.com>', 
        to: 'vccong2710@gmail.com', 
        subject: '⚠️ CẢNH BÁO: Phát hiện chỉ số vượt ngưỡng!',
        html: `<h2>⚠️ CẢNH BÁO NGUY HIỂM</h2><p>Nhiệt độ: ${data.nhiet_do}°C | Gas: ${data.khi_gas}</p>`
    };

    transporter.sendMail(mailOptions, (error) => {
        if (!error) lastEmailSentTime = now;
    });
}

// --- CÁC ROUTE (ĐƯỜNG DẪN) ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 1. ROUTE MỚI: Mở giao diện trang lịch sử
app.get('/view-history', (req, res) => {
    res.sendFile(path.join(__dirname, 'history.html'));
});

// 2. ROUTE LẤY DỮ LIỆU: Trả về JSON cho trang web xử lý
app.get('/history', async (req, res) => {
    try {
        const logs = await SensorLog.find().sort({ thoi_gian: -1 }).limit(100);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: "Lỗi lấy dữ liệu" });
    }
});

app.get('/get-config', (req, res) => { res.json(config); });

app.post('/update', async (req, res) => {
    const data = req.body;
    try {
        const isAlertStatus = (data.canh_bao === true || data.canh_bao === "true");
        const newLog = new SensorLog({
            nhiet_do: data.nhiet_do,
            do_am: data.do_am,
            khi_gas: data.khi_gas,
            canh_bao: isAlertStatus
        });
        await newLog.save();
        if (isAlertStatus) sendAlertEmail(data);
    } catch (dbErr) { console.error("Lỗi lưu DB:", dbErr.message); }

    io.emit('sensor_data', data); 
    res.status(200).send("OK");
});

io.on('connection', (socket) => {
    socket.emit('current_config', config);
    socket.on('set_threshold', (newConfig) => {
        config.tempThreshold = parseFloat(newConfig.temp);
        config.gasThreshold = parseInt(newConfig.gas);
        io.emit('current_config', config);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SERVER ĐANG CHẠY TẠI PORT: ${PORT}`);
});
