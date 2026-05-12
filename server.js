const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Cấu hình để Node.js hiểu dữ liệu JSON từ ESP32 gửi lên
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Biến lưu trữ ngưỡng cảnh báo (Mặc định)
let config = {
    tempThreshold: 35.0,
    gasThreshold: 2000
};

// 1. TRANG CHỦ: Hiển thị giao diện web
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. API CHO ESP32: Lấy ngưỡng cảnh báo hiện tại về thiết bị
app.get('/get-config', (req, res) => {
    console.log("--> ESP32 đang hỏi lấy ngưỡng cài đặt...");
    res.json(config);
});

// 3. API CHO ESP32: Nhận dữ liệu cảm biến gửi lên
app.post('/update', (req, res) => {
    const data = req.body;
    
    // In ra màn hình đen (Terminal) để kiểm tra dữ liệu từ ESP32
    console.log("\n--- DỮ LIỆU MỚI TỪ ESP32 ---");
    console.log(`Nhiệt độ: ${data.nhiet_do} | Độ ẩm: ${data.do_am} | Gas: ${data.khi_gas}`);
    console.log(`Trạng thái cảnh báo: ${data.canh_bao ? "CÓ" : "KHÔNG"}`);
    
    // Gửi dữ liệu này tới giao diện Web (index.html) qua Socket.io
    io.emit('sensor_data', data); 
    
    // Trả lời cho ESP32 biết là đã nhận xong
    res.status(200).send("Server da nhan du lieu");
});

// 4. QUẢN LÝ KẾT NỐI SOCKET.IO (Giao tiếp với Web)
io.on('connection', (socket) => {
    console.log('>>> Có 1 người dùng vừa mở Web!');
    
    // Gửi ngưỡng hiện tại lên Web khi mới mở trang
    socket.emit('current_config', config);

    // Lắng nghe lệnh thay đổi ngưỡng từ giao diện Web
    socket.on('set_threshold', (newConfig) => {
        config.tempThreshold = parseFloat(newConfig.temp);
        config.gasThreshold = parseInt(newConfig.gas);
        console.log("!!! CẬP NHẬT NGƯỠNG MỚI TỪ WEB:", config);
        
        // Gửi xác nhận lại cho web
        io.emit('current_config', config);
    });

    socket.on('disconnect', () => {
        console.log('<<< Người dùng đã đóng Web.');
    });
});

// 5. CHẠY SERVER
const PORT = 3000;
const IP_MAY_TINH = '0.0.0.0'; // Cho phép mọi thiết bị trong mạng truy cập
server.listen(PORT, IP_MAY_TINH, () => {
    console.log("========================================");
    console.log(`SERVER ĐANG CHẠY TẠI PORT: ${PORT}`);
    console.log(`Đang chờ dữ liệu từ ESP32...`);
    console.log("========================================");
});