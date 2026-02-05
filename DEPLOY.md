# Deploy to Vercel

## 🚀 Deployment Steps

### 1. Commit to Git
```bash
git init
git add .
git commit -m "Initial commit: Image Prompt Server for Vercel"
```

### 2. Push to GitHub
```bash
# Create new repo on GitHub first, then:
git remote add origin https://github.com/YOUR_USERNAME/image-prompt-server.git
git branch -M main
git push -u origin main
```

### 3. Deploy to Vercel
1. Go to [vercel.com](https://vercel.com)
2. Import your GitHub repository
3. **Set Environment Variable:**
   - `GOOGLE_API_KEY` = `AIzaSyBwKgHORXCCUPrNXGEA0dWNaLh20auJfUk`
4. Deploy!

## 🔧 Key Changes for Serverless

### ✅ Serverless-Ready Features:
- **Memory Storage**: Files stored in memory (not filesystem)
- **Base64 Images**: Images returned as data URLs
- **No File Persistence**: No local file uploads/downloads
- **Environment Variables**: Proper .env handling
- **Vercel Config**: vercel.json for deployment

### 📋 API Endpoints:
- `POST /process` - Process images with 3 modes
- `GET /health` - Health check
- `GET /results` - List all results

### 🎯 3 Processing Modes:
1. **text-to-image**: Generate image from prompt only
2. **image-to-image**: Transform image with prompt  
3. **image-to-desc**: Analyze and describe image

### 📱 Response Format:
```json
{
  "success": true,
  "taskId": "uuid",
  "result": {
    "mode": "text-to-image",
    "generatedImageUrl": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "base64Data": "iVBORw0KGgoAAAANSUhEUgAA...",
    "mimeType": "image/png"
  }
}
```

## 🧪 Testing Production:
```bash
# Test with curl
curl -X POST https://your-app.vercel.app/process \
  -F "mode=text-to-image" \
  -F "prompt=A beautiful sunset"
```

## ⚠️ Important Notes:
- Images are returned as base64 data URLs (no file storage)
- Perfect for frontend display: `<img src="data:image/png;base64,...">`
- Serverless compatible - no file system dependencies
- 10MB upload limit maintained
