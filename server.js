const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const nodemailer = require('nodemailer'); // Thư viện gửi Email

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- 1. CẤU HÌNH CƠ BẢN ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Biến lưu trữ ngưỡng cảnh báo (Sẽ thay đổi khi bạn chỉnh trên Web)
let config = {
    tempThreshold: 35.0,
    gasThreshold: 2000
};

// --- 2. CẤU HÌNH GỬI EMAIL ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'vccong2710gmail.com', // Email dùng để gửi đi
        pass: 'qqbn kijf qgtq ktvn'      // Mật khẩu ứng dụng (App Password)
    }
});

let lastEmailSentTime = 0;
const EMAIL_INTERVAL = 300000; // 5 phút (300.000ms) - Giới hạn thời gian giữa 2 lần gửi mail để tránh spam

// Hàm thực hiện gửi Email
function sendAlertEmail(data) {
    const now = Date.now();
    // Kiểm tra nếu chưa đủ 5 phút kể từ lần gửi cuối thì bỏ qua
    if (now - lastEmailSentTime < EMAIL_INTERVAL) return;

    const mailOptions = {
        from: '"Hệ Thống IoT Cảnh Báo" <email_cua_ban@gmail.com>',
        to: 'email_nhan_thong_bao@gmail.com', // Email người nhận
        subject: '⚠️ CẢNH BÁO: Phát hiện chỉ số vượt ngưỡng!',
        html: `
            <div style="font-family: Arial, sans-serif; border: 1px solid #ff0000; padding: 20px;">
                <h2 style="color: #ff0000;">⚠️ CẢNH BÁO NGUY HIỂM</h2>
                <p>Hệ thống giám sát vừa ghi nhận các chỉ số vượt mức an toàn:</p>
                <ul>
                    <li><b>Nhiệt độ:</b> <span style="color:red">${data.nhiet_do} °C</span> (Ngưỡng: ${config.tempThreshold} °C)</li>
                    <li><b>Độ ẩm:</b> ${data.do_am} %</li>
                    <li><b>Nồng độ Gas:</b> <span style="color:red">${data.khi_gas}</span> (Ngưỡng: ${config.gasThreshold})</li>
                </ul>
                <hr>
                <p>Vui lòng truy cập <a href="https://ketnoicloud.onrender.com">Dashboard</a> để kiểm tra ngay lập tức.</p>
            </div>
        `
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log("❌ Lỗi gửi Email:", error);
        } else {
            console.log("✅ Email cảnh báo đã được gửi thành công!");
            lastEmailSentTime = now; // Cập nhật lại thời gian gửi cuối cùng
        }
    });
}

// --- 3. ĐIỀU HƯỚNG (ROUTING) ---

// Giao diện người dùng
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API cho ESP32 lấy cấu hình ngưỡng hiện tại
app.get('/get-config', (req, res) => {
    console.log("--> ESP32 đang hỏi lấy ngưỡng cài đặt...");
    res.json(config);
});

// API cho ESP32 đẩy dữ liệu cảm biến lên
app.post('/update', (req, res) => {
    const data = req.body;
    
    // Log dữ liệu ra màn hình Terminal để theo dõi
    console.log("\n--- DỮ LIỆU MỚI TỪ ESP32 ---");
    console.log(`Nhiệt độ: ${data.nhiet_do} | Độ ẩm: ${data.do_am} | Gas: ${data.khi_gas}`);
    console.log(`Cảnh báo: ${data.canh_bao ? "⚠️ ĐANG BẬT" : "✅ An toàn"}`);
    
    // LOGIC GỬI EMAIL: Nếu có tín hiệu cảnh báo từ ESP32, tiến hành gửi mail
    if (data.canh_bao === true || data.canh_bao === "true") {
        sendAlertEmail(data);
    }

    // Gửi dữ liệu cập nhật thời gian thực lên giao diện Web
    io.emit('sensor_data', data); 
    
    res.status(200).send("Server da nhan du lieu");
});

// --- 4. GIAO TIẾP SOCKET.IO (VỚI TRÌNH DUYỆT) ---

io.on('connection', (socket) => {
    console.log('>>> [Web] Có người dùng vừa kết nối');
    
    // Gửi cấu hình ngưỡng hiện tại khi người dùng vừa mở trang web
    socket.emit('current_config', config);

    // Lắng nghe lệnh cập nhật ngưỡng từ nút bấm trên Web
    socket.on('set_threshold', (newConfig) => {
        config.tempThreshold = parseFloat(newConfig.temp);
        config.gasThreshold = parseInt(newConfig.gas);
        console.log("⚙️ [Config] Đã cập nhật ngưỡng mới:", config);
        
        // Phát thông báo tới TẤT CẢ các trang web đang mở để cập nhật hiển thị
        io.emit('current_config', config);
    });

    socket.on('disconnect', () => {
        console.log('<<< [Web] Người dùng đã ngắt kết nối');
    });
});

// --- 5. KHỞI CHẠY SERVER ---
const PORT = process.env.PORT || 3000; // Sử dụng cổng của Cloud (Render) hoặc cổng 3000 nếu chạy máy cục bộ
server.listen(PORT, '0.0.0.0', () => {
    console.log("========================================");
    console.log(`🚀 SERVER ĐANG CHẠY TẠI PORT: ${PORT}`);
    console.log(`📡 Đang chờ dữ liệu từ ESP32...`);
    console.log("========================================");
});
