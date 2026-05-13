const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const nodemailer = require('nodemailer'); 
const mongoose = require('mongoose'); // Ghi chú: Thêm thư viện Mongoose để dùng Database

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- CẤU HÌNH DATABASE (MONGODB ATLAS) ---
// Ghi chú: Thay 'MK_CUA_BAN' bằng mật khẩu bạn vừa tạo ở bước Database Access
const mongoURI = "mongodb+srv://admin:VCC123456@cluster0.yaz7fki.mongodb.net/TramGiamSatIOT?retryWrites=true&w=majority";

mongoose.connect(mongoURI)
    .then(() => console.log("🚀 Đã kết nối thành công với MongoDB Atlas!"))
    .catch(err => console.error("❌ Lỗi kết nối Database:", err));

// Định nghĩa cấu trúc (Schema) để lưu dữ liệu vào DB
const sensorSchema = new mongoose.Schema({
    nhiet_do: Number,
    do_am: Number,
    khi_gas: Number,
    canh_bao: Boolean,
    thoi_gian: { type: Date, default: Date.now } // Tự động lưu thời gian gửi
});

// Tạo Model để thao tác với Collection 'SensorLogs'
const SensorLog = mongoose.model('SensorLog', sensorSchema);

// --- CẤU HÌNH CONFIG & EMAIL ---
let config = {
    tempThreshold: 35.0,
    gasThreshold: 2000
};

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, 
    auth: {
        user: 'vccong2710@gmail.com',
        pass: 'qqbnkijfqgtqktvn' 
    },
    tls: {
        rejectUnauthorized: false 
    }
});

let lastEmailSentTime = 0;
const EMAIL_INTERVAL = 300000; 

function sendAlertEmail(data) {
    const now = Date.now();
    if (now - lastEmailSentTime < EMAIL_INTERVAL) {
        console.log("⏳ Vừa gửi email cách đây chưa lâu, vui lòng đợi thêm...");
        return;
    }

    const mailOptions = {
        from: '"Hệ Thống IoT Cảnh Báo" <vccong2710@gmail.com>', 
        to: 'vccong2710@gmail.com', 
        subject: '⚠️ CẢNH BÁO: Phát hiện chỉ số vượt ngưỡng!',
        html: `
            <div style="font-family: Arial, sans-serif; border: 2px solid #ff0000; padding: 20px; border-radius: 10px;">
                <h2 style="color: #ff0000; text-align: center;">⚠️ CẢNH BÁO NGUY HIỂM</h2>
                <p>Hệ thống giám sát ghi nhận thông số bất thường:</p>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr style="background-color: #f8d7da;">
                        <th style="padding: 10px; border: 1px solid #dee2e6; text-align: left;">Thông số</th>
                        <th style="padding: 10px; border: 1px solid #dee2e6; text-align: left;">Giá trị</th>
                        <th style="padding: 10px; border: 1px solid #dee2e6; text-align: left;">Ngưỡng</th>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #dee2e6;">Nhiệt độ</td>
                        <td style="padding: 10px; border: 1px solid #dee2e6; color: red; font-weight: bold;">${data.nhiet_do} °C</td>
                        <td style="padding: 10px; border: 1px solid #dee2e6;">${config.tempThreshold} °C</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #dee2e6;">Nồng độ Gas</td>
                        <td style="padding: 10px; border: 1px solid #dee2e6; color: red; font-weight: bold;">${data.khi_gas}</td>
                        <td style="padding: 10px; border: 1px solid #dee2e6;">${config.gasThreshold}</td>
                    </tr>
                </table>
                <p style="margin-top: 20px;">Kiểm tra chi tiết tại: <a href="https://ketnoicloud.onrender.com">Bảng điều khiển</a></p>
            </div>
        `
    };

    console.log("📨 Đang tiến hành gửi email...");
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log("❌ Lỗi gửi Email:", error.message);
        } else {
            console.log("✅ Email đã gửi thành công!");
            lastEmailSentTime = now;
        }
    });
}

// --- CÁC ROUTE ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/get-config', (req, res) => {
    res.json(config);
});

// Route mới để xem lịch sử dữ liệu (Dùng cho báo cáo đồ án)
app.get('/history', async (req, res) => {
    try {
        const logs = await SensorLog.find().sort({ thoi_gian: -1 }).limit(100);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: "Lỗi lấy dữ liệu" });
    }
});

app.post('/update', async (req, res) => {
    const data = req.body;
    console.log(`\n--- DỮ LIỆU: Temp: ${data.nhiet_do} | Gas: ${data.khi_gas} | Cảnh báo: ${data.canh_bao}`);
    
    // GHI CHÚ: Lưu dữ liệu vào MongoDB
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

    // Kiểm tra gửi Email cảnh báo
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
