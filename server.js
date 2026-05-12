const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const nodemailer = require('nodemailer'); 

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let config = {
    tempThreshold: 35.0,
    gasThreshold: 2000
};

// --- CẤU HÌNH GỬI EMAIL (ĐÃ SỬA ĐỂ CHẠY TRÊN RENDER) ---
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // Sử dụng STARTTLS cho cổng 587
    auth: {
        user: 'vccong2710@gmail.com',
        pass: 'qqbnkijfqgtqktvn' 
    },
    tls: {
        // Hỗ trợ kết nối từ môi trường Cloud (không bị lỗi chứng chỉ)
        rejectUnauthorized: false 
    }
});

let lastEmailSentTime = 0;
const EMAIL_INTERVAL = 300000; // 5 phút gửi 1 lần

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

app.post('/update', (req, res) => {
    const data = req.body;
    console.log(`\n--- DỮ LIỆU: Temp: ${data.nhiet_do} | Gas: ${data.khi_gas} | Cảnh báo: ${data.canh_bao}`);
    
    // Kiểm tra đúng kiểu dữ liệu (boolean hoặc string "true")
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
