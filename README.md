# Image Prompt Server

Một server Node.js đơn giản để xử lý các request với ảnh và prompt.

## Tính năng

- Upload ảnh và gửi prompt
- Xử lý ảnh với prompt được cung cấp
- Lưu trữ và truy xuất kết quả
- API RESTful đơn giản
- Hỗ trợ các định dạng ảnh phổ biến
- Giới hạn kích thước file (10MB)

## Cài đặt

1. **Cài đặt dependencies:**
```bash
npm install
```

2. **Tạo file .env (nếu cần):**
```
PORT=3000
```

3. **Chạy server:**
```bash
# Development mode với nodemon
npm run dev

# Production mode
npm start
```

## API Endpoints

### 1. Health Check
```
GET /health
```
Kiểm tra trạng thái server.

### 2. Process Image với Prompt
```
POST /process
```
Upload ảnh và prompt để xử lý.

**Request - Cách 1 (Upload file):**
- `image`: File ảnh (multipart/form-data)
- `prompt`: Text prompt (form field)

**Request - Cách 2 (Image URL):**
- `imageUrl`: URL của ảnh (form field)
- `prompt`: Text prompt (form field)

**Response:**
```json
{
  "success": true,
  "taskId": "uuid-string",
  "status": "completed",
  "result": {
    "message": "Processed image with prompt...",
    "confidence": 0.95,
    "tags": ["example", "processed"],
    "description": "...",
    "processedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 3. Lấy kết quả theo Task ID
```
GET /result/:taskId
```
Lấy kết quả xử lý theo task ID.

### 4. Lấy tất cả kết quả
```
GET /results
```
Lấy danh sách tất cả kết quả đã xử lý.

### 5. Xem ảnh đã upload
```
GET /uploads/:filename
```
Xem ảnh đã được upload.

### 6. Xem file output
```
GET /outputs/:filename
```
Xem file kết quả đã được tạo.

### 7. Xóa kết quả
```
DELETE /result/:taskId
```
Xóa kết quả và file liên quan.

## Cách sử dụng với curl

### Upload ảnh và prompt:
```bash
curl -X POST http://localhost:3000/process \
  -F "image=@path/to/your/image.jpg" \
  -F "prompt=Describe this image"
```

### Sử dụng image URL:
```bash
curl -X POST http://localhost:3000/process \
  -F "imageUrl=https://img.kalocdn.com/tiktok.product.images/tos-alisg-i-aphluv4xwc-sg/31bdefa7fd734f5a82090a01ac24524d.png" \
  -F "prompt=Describe this image"
```

### Lấy kết quả:
```bash
curl http://localhost:3000/result/your-task-id
```

## Cách sử dụng với JavaScript

### Upload file với fetch:
```javascript
const formData = new FormData();
formData.append('image', imageFile);
formData.append('prompt', 'Your prompt here');

fetch('http://localhost:3000/process', {
  method: 'POST',
  body: formData
})
.then(response => response.json())
.then(data => console.log(data));
```

### Sử dụng image URL với fetch:
```javascript
const formData = new FormData();
formData.append('imageUrl', 'https://example.com/image.jpg');
formData.append('prompt', 'Your prompt here');

fetch('http://localhost:3000/process', {
  method: 'POST',
  body: formData
})
.then(response => response.json())
.then(data => console.log(data));
```

## Cấu trúc thư mục

```
image-prompt-server/
├── server.js          # Main server file
├── package.json       # Dependencies
├── .env              # Environment variables
├── .gitignore        # Git ignore rules
├── uploads/          # Uploaded images (auto-created)
├── outputs/          # Processing outputs (auto-created)
└── README.md         # This file
```

## Customization

Để tùy chỉnh logic xử lý ảnh, hãy sửa đổi function `processImageWithPrompt()` trong [server.js](server.js). Hiện tại nó chỉ return mock data, bạn có thể tích hợp với:

- OpenAI Vision API
- Google Vision API  
- Ideogram API
- Các AI service khác

## Lưu ý

- Server hiện tại chỉ chấp nhận file ảnh (JPEG, PNG, GIF, etc.)
- Giới hạn kích thước file là 10MB
- Kết quả được lưu trong memory, sẽ mất khi restart server
- Để production, nên sử dụng database để lưu metadata
