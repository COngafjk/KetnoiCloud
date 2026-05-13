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

// --- 1. CẤU HÌNH DATABASE (GIỮ NGUYÊN) ---
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

// --- 2. CẤU HÌNH CONFIG & EMAIL (SỬA ĐỂ TRÁNH TIMEOUT) ---
let config = { tempThreshold: 35.0, gasThreshold: 2000 };

const transporter = nodemailer.createTransport({
    service: 'gmail', // Sử dụng service thay vì host/port để ổn định hơn trên Render
    auth: {
        user: 'vccong2710@gmail.com',
        pass: 'qqbnkijfqgtqktvn' 
    }
});

let lastEmailSentTime = 0;
const EMAIL_INTERVAL = 30000; // Tạm giảm xuống 30 giây để bạn dễ Demo

function sendAlertEmail(data) {
    const now = Date.now();
    if (now - lastEmailSentTime < EMAIL_INTERVAL) {
        console.log("⏳ Vừa gửi email, vui lòng đợi...");
        return;
    }

    const mailOptions = {
        from: '"Hệ Thống IoT Cảnh Báo" <vccong2710@gmail.com>', 
        to: 'vccong2710@gmail.com', 
        subject: '⚠️ CẢNH BÁO: Phát hiện chỉ số vượt ngưỡng!',
        html: `
            <div style="font-family: Arial, sans-serif; border: 2px solid #ff0000; padding: 20px; border-radius: 10px;">
                <h2 style="color: #ff0000; text-align: center;">⚠️ CẢNH BÁO NGUY HIỂM</h2>
                <p>Nhiệt độ: <b>${data.nhiet_do} °C</b> | Gas: <b>${data.khi_gas}</b></p>
                <p>Kiểm tra tại: <a href="https://ketnoicloud.onrender.com">Dashboard</a></p>
            </div>
        `
    };

    console.log("📨 Đang gửi email...");
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log("❌ Lỗi gửi Email chi tiết:", error.message);
        } else {
            console.log("✅ Email đã gửi thành công!");
            lastEmailSentTime = now;
        }
    });
}

// --- 3. CÁC ROUTE (GIỮ NGUYÊN LOGIC) ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/view-history', (req, res) => {
    res.sendFile(path.join(__dirname, 'history.html'));
});

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
    console.log(`\n--- DỮ LIỆU: Temp: ${data.nhiet_do} | Gas: ${data.khi_gas} | Cảnh báo: ${data.canh_bao}`);
    
    // Lưu Database
    try {
        const isAlertStatus = (data.canh_bao === true || data.canh_bao === "true");
        const newLog = new SensorLog({
            nhiet_do: data.nhiet_do,
            do_am: data.do_am,
            khi_gas: data.khi_gas,
            canh_bao: isAlertStatus
        });
        await newLog.save();
        console.log("💾 Đã lưu dữ liệu vào Database!");
    } catch (dbErr) {
        console.error("❌ Lỗi lưu DB:", dbErr.message);
    }

    // Gửi Email nếu có cảnh báo
    if (data.canh_bao === true || data.canh_bao === "true") {
        sendAlertEmail(data);
    }

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
