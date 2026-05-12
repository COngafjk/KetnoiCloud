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

// --- CẤU HÌNH GỬI EMAIL ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'vccong2710@gmail.com', // ĐÃ SỬA: Thêm ký tự @
        pass: 'qqbnkijfqgtqktvn'      // Mật khẩu ứng dụng (App Password)
    }
});

let lastEmailSentTime = 0;
const EMAIL_INTERVAL = 300000; // 5 phút gửi 1 lần

function sendAlertEmail(data) {
    const now = Date.now();
    if (now - lastEmailSentTime < EMAIL_INTERVAL) return;

    const mailOptions = {
        // ĐÃ SỬA: Để 'from' khớp với tài khoản gửi
        from: '"Hệ Thống IoT Cảnh Báo" <vccong2710@gmail.com>', 
        to: 'vccong2710@gmail.com', // ĐÃ SỬA: Gửi cho chính bạn để kiểm tra
        subject: '⚠️ CẢNH BÁO: Phát hiện chỉ số vượt ngưỡng!',
        html: `
            <div style="font-family: Arial, sans-serif; border: 2px solid #ff0000; padding: 20px; border-radius: 10px;">
                <h2 style="color: #ff0000; text-align: center;">⚠️ CẢNH BÁO NGUY HIỂM</h2>
                <p>Hệ thống tại trạm giám sát vừa ghi nhận các chỉ số vượt mức an toàn:</p>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr style="background-color: #f8d7da;">
                        <th style="padding: 10px; border: 1px solid #dee2e6;">Thông số</th>
                        <th style="padding: 10px; border: 1px solid #dee2e6;">Giá trị</th>
                        <th style="padding: 10px; border: 1px solid #dee2e6;">Ngưỡng</th>
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
                <p style="margin-top: 20px;">Vui lòng truy cập <a href="https://ketnoicloud.onrender.com" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Bảng điều khiển</a> để xử lý.</p>
            </div>
        `
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log("❌ Lỗi gửi Email:", error);
        } else {
            console.log("✅ Email cảnh báo đã được gửi thành công đến vccong2710@gmail.com!");
            lastEmailSentTime = now;
        }
    });
}

// --- CÁC ROUTE CÒN LẠI GIỮ NGUYÊN ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/get-config', (req, res) => {
    res.json(config);
});

app.post('/update', (req, res) => {
    const data = req.body;
    console.log(`\n--- DỮ LIỆU: Temp: ${data.nhiet_do} | Gas: ${data.khi_gas} | Cảnh báo: ${data.canh_bao}`);
    
    if (data.canh_bao === true || data.canh_bao === "true") {
        sendAlertEmail(data);
    }

    io.emit('sensor_data', data); 
    res.status(200).send("Server da nhan du lieu");
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
