const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Google AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Function to generate actual image using Gemini API (like Python code)
async function generateImageFromText(prompt, taskId) {
	try {
		const model = genAI.getGenerativeModel({
			model: 'gemini-3-pro-image-preview',
		});

		const result = await model.generateContent({
			contents: [
				{
					role: 'user',
					parts: [{ text: prompt }],
				},
			],
			generationConfig: {
				response_modalities: ['IMAGE', 'TEXT'],
				image_config: {
					aspect_ratio: '1:1',
				},
			},
		});

		// Extract image data from response (similar to Python inline_data processing)
		if (
			result.response &&
			result.response.candidates &&
			result.response.candidates[0]
		) {
			const candidate = result.response.candidates[0];
			if (candidate.content && candidate.content.parts) {
				for (const part of candidate.content.parts) {
					if (part.inlineData && part.inlineData.data) {
						// Save the image file
						const imageData = part.inlineData.data;
						const mimeType =
							part.inlineData.mimeType || 'image/png';
						const extension = mimeType.split('/')[1] || 'png';
						const filename = `generated-${taskId}.${extension}`;
						const filepath = path.join(outputsDir, filename);

						// Convert base64 to buffer and save
						const buffer = Buffer.from(imageData, 'base64');
						await fs.promises.writeFile(filepath, buffer);

						console.log(`Generated image saved: ${filepath}`);
						return {
							filename,
							filepath,
							url: `/outputs/${filename}`,
						};
					}
				}
			}
		}

		throw new Error('No image data returned from Gemini API');
	} catch (error) {
		console.error('Error generating image:', error);
		throw error;
	}
}

// Function to generate image from existing image + prompt
async function generateImageFromImage(
	imageBuffer,
	imageMimeType,
	prompt,
	taskId
) {
	try {
		const model = genAI.getGenerativeModel({
			model: 'gemini-3-pro-image-preview',
		});

		const imageData = await bufferToBase64(imageBuffer, imageMimeType);

		const result = await model.generateContent({
			contents: [
				{
					role: 'user',
					parts: [imageData, { text: prompt }],
				},
			],
			generationConfig: {
				response_modalities: ['IMAGE', 'TEXT'],
				image_config: {
					aspect_ratio: '1:1',
				},
			},
		});

		// Return base64 data instead of saving to file (for serverless)
		if (
			result.response &&
			result.response.candidates &&
			result.response.candidates[0]
		) {
			const candidate = result.response.candidates[0];
			if (candidate.content && candidate.content.parts) {
				for (const part of candidate.content.parts) {
					if (part.inlineData && part.inlineData.data) {
						const imageData = part.inlineData.data;
						const mimeType =
							part.inlineData.mimeType || 'image/png';
						const filename = `transformed-${taskId}.png`;

						console.log(`Generated transformed image: ${filename}`);
						return {
							filename,
							base64Data: imageData,
							mimeType: mimeType,
							url: `data:${mimeType};base64,${imageData}`,
						};

						const buffer = Buffer.from(imageData, 'base64');
						await fs.promises.writeFile(filepath, buffer);

						console.log(`Transformed image saved: ${filepath}`);
						return {
							filename,
							filepath,
							url: `/outputs/${filename}`,
						};
					}
				}
			}
		}

		throw new Error('No image data returned from Gemini API');
	} catch (error) {
		console.error('Error transforming image:', error);
		throw error;
	}
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Note: In serverless environment (Vercel), we can't create persistent directories
// Files will be handled in memory or using cloud storage

// Configure multer for file uploads (memory storage for serverless)
const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: 10 * 1024 * 1024, // 10MB limit
	},
	fileFilter: (req, file, cb) => {
		// Check if file is an image
		if (file.mimetype.startsWith('image/')) {
			cb(null, true);
		} else {
			cb(new Error('Only image files are allowed!'), false);
		}
	},
});

// Store for processing results
const processingResults = new Map();

// Routes

// Health check endpoint
app.get('/health', (req, res) => {
	res.json({ status: 'OK', message: 'Image Prompt Server is running' });
});

// Upload and process image with prompt
app.post('/process', upload.single('image'), async (req, res) => {
	try {
		const { prompt, imageUrl, mode } = req.body;

		// Validate mode
		const validModes = ['text-to-image', 'image-to-image', 'image-to-desc'];
		if (!mode || !validModes.includes(mode)) {
			return res.status(400).json({
				error: 'Mode is required. Valid modes: text-to-image, image-to-image, image-to-desc',
			});
		}

		// Validate inputs based on mode
		if (mode === 'text-to-image') {
			if (!prompt) {
				return res.status(400).json({
					error: 'Prompt is required for text-to-image mode',
				});
			}
			// No image needed for text-to-image
		} else if (mode === 'image-to-image') {
			if (!prompt) {
				return res.status(400).json({
					error: 'Prompt is required for image-to-image mode',
				});
			}
			if (!req.file && !imageUrl) {
				return res.status(400).json({
					error: 'Either image file upload or imageUrl is required for image-to-image mode',
				});
			}
		} else if (mode === 'image-to-desc') {
			if (!req.file && !imageUrl) {
				return res.status(400).json({
					error: 'Either image file upload or imageUrl is required for image-to-desc mode',
				});
			}
			// Prompt is optional for image-to-desc
		}

		const taskId = uuidv4();
		let imageBuffer = null;
		let imageMimeType = null;
		let imageFilename = null;
		let imageInfo = null;
		let isDownloadedImage = false;

		// Handle image processing based on mode
		if (mode === 'text-to-image') {
			// No image needed for text-to-image
			// Will generate image from prompt only
		} else {
			// Handle image URL download or uploaded file for image-to-image and image-to-desc
			if (imageUrl && !req.file) {
				try {
					const downloadResult = await downloadImageFromUrl(
						imageUrl,
						taskId
					);
					// For URL downloads, we still use file path temporarily
					imageBuffer = await fs.promises.readFile(
						downloadResult.path
					);
					imageMimeType = 'image/jpeg'; // Default, can be improved
					imageFilename = downloadResult.filename;
					isDownloadedImage = true;

					// Clean up temp file
					try {
						await fs.promises.unlink(downloadResult.path);
					} catch (unlinkError) {
						console.warn(
							'Could not clean up temp file:',
							unlinkError
						);
					}
				} catch (downloadError) {
					return res.status(400).json({
						error: 'Failed to download image from URL',
						details: downloadError.message,
					});
				}
			} else if (req.file) {
				// Use uploaded file buffer (memory storage)
				imageBuffer = req.file.buffer;
				imageMimeType = req.file.mimetype;
				imageFilename = req.file.originalname;
			}

			// Get image metadata if we have an image buffer
			if (imageBuffer) {
				imageInfo = await sharp(imageBuffer).metadata();
			}
		}

		// Process based on mode
		const result = await processWithMode(mode, imagePath, prompt, taskId);

		// Store result
		processingResults.set(taskId, {
			taskId,
			status: 'completed',
			mode,
			prompt,
			originalImage: imageFilename,
			imageSource: imageUrl ? 'url' : req.file ? 'upload' : 'none',
			originalUrl: imageUrl || null,
			imageInfo: imageInfo
				? {
						width: imageInfo.width,
						height: imageInfo.height,
						format: imageInfo.format,
					}
				: null,
			result,
			timestamp: new Date().toISOString(),
		});

		res.json({
			success: true,
			taskId,
			status: 'completed',
			result,
		});
	} catch (error) {
		console.error('Processing error:', error);
		res.status(500).json({
			error: 'Failed to process image',
			details: error.message,
		});
	}
});

// Get processing result by task ID
app.get('/result/:taskId', (req, res) => {
	const taskId = req.params.taskId;
	const result = processingResults.get(taskId);

	if (!result) {
		return res.status(404).json({ error: 'Task not found' });
	}

	res.json(result);
});

// List all processing results
app.get('/results', (req, res) => {
	const results = Array.from(processingResults.values());
	res.json({
		total: results.length,
		results,
	});
});

// Serve uploaded images
app.get('/uploads/:filename', (req, res) => {
	const filename = req.params.filename;
	const filePath = path.join(uploadsDir, filename);

	if (fs.existsSync(filePath)) {
		res.sendFile(filePath);
	} else {
		res.status(404).json({ error: 'Image not found' });
	}
});

// Serve output files
app.get('/outputs/:filename', (req, res) => {
	const filename = req.params.filename;
	const filePath = path.join(outputsDir, filename);

	if (fs.existsSync(filePath)) {
		res.sendFile(filePath);
	} else {
		res.status(404).json({ error: 'Output file not found' });
	}
});

// Delete a specific result
app.delete('/result/:taskId', (req, res) => {
	const taskId = req.params.taskId;

	if (processingResults.has(taskId)) {
		const result = processingResults.get(taskId);

		// Clean up files
		try {
			const imagePath = path.join(uploadsDir, result.originalImage);
			if (fs.existsSync(imagePath)) {
				fs.unlinkSync(imagePath);
			}
		} catch (error) {
			console.error('Error cleaning up files:', error);
		}

		processingResults.delete(taskId);
		res.json({ success: true, message: 'Result deleted successfully' });
	} else {
		res.status(404).json({ error: 'Task not found' });
	}
});

// Function to download image from URL
async function downloadImageFromUrl(imageUrl, taskId) {
	try {
		// Validate URL
		const url = new URL(imageUrl);
		if (!['http:', 'https:'].includes(url.protocol)) {
			throw new Error('Only HTTP and HTTPS URLs are supported');
		}

		// Make request to download image
		const response = await axios({
			method: 'GET',
			url: imageUrl,
			responseType: 'stream',
			timeout: 30000, // 30 seconds timeout
			headers: {
				'User-Agent': 'Mozilla/5.0 (compatible; ImageProcessor/1.0)',
			},
		});

		// Check if response is successful
		if (response.status !== 200) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		// Check content type
		const contentType = response.headers['content-type'];
		if (!contentType || !contentType.startsWith('image/')) {
			throw new Error('URL does not point to an image file');
		}

		// Generate filename
		const urlPath = url.pathname;
		const originalExt = path.extname(urlPath) || '.jpg';
		const filename = `url-${taskId}-${Date.now()}${originalExt}`;
		const filePath = path.join(uploadsDir, filename);

		// Create write stream and pipe the response
		const writer = fs.createWriteStream(filePath);
		response.data.pipe(writer);

		// Return promise that resolves when download is complete
		return new Promise((resolve, reject) => {
			writer.on('finish', () => {
				resolve({ path: filePath, filename });
			});
			writer.on('error', (error) => {
				// Clean up file on error
				if (fs.existsSync(filePath)) {
					fs.unlinkSync(filePath);
				}
				reject(error);
			});
		});
	} catch (error) {
		throw new Error(`Failed to download image: ${error.message}`);
	}
}

// Helper function to convert buffer to base64 for Gemini API
async function bufferToBase64(buffer, mimeType) {
	try {
		const base64String = buffer.toString('base64');
		return {
			inlineData: {
				data: base64String,
				mimeType: mimeType,
			},
		};
	} catch (error) {
		throw new Error(`Failed to process buffer: ${error.message}`);
	}
}

// Helper function to convert image file to base64 (for URL downloads)
async function imageToBase64(imagePath) {
	try {
		const imageBuffer = await fs.promises.readFile(imagePath);
		const base64String = imageBuffer.toString('base64');

		// Get image metadata to determine MIME type
		const imageInfo = await sharp(imagePath).metadata();
		let mimeType;
		switch (imageInfo.format) {
			case 'jpeg':
				mimeType = 'image/jpeg';
				break;
			case 'png':
				mimeType = 'image/png';
				break;
			case 'gif':
				mimeType = 'image/gif';
				break;
			case 'webp':
				mimeType = 'image/webp';
				break;
			default:
				mimeType = 'image/jpeg'; // default fallback
		}

		return {
			inlineData: {
				data: base64String,
				mimeType: mimeType,
			},
		};
	} catch (error) {
		throw new Error(`Failed to process image: ${error.message}`);
	}
}

// Processing function with different modes
async function processWithMode(mode, imagePath, prompt, taskId) {
	console.log(`Processing mode: ${mode}`);
	console.log(`Image path: ${imagePath}`);
	console.log(`Prompt: ${prompt}`);
	console.log(`Task ID: ${taskId}`);

	try {
		switch (mode) {
			case 'text-to-image':
				// Generate real image using Gemini API
				console.log('Generating image from text prompt...');
				const generatedImage = await generateImageFromText(
					prompt,
					taskId
				);

				return {
					mode: 'text-to-image',
					message: `Successfully generated image from prompt: "${prompt}"`,
					generatedImageUrl: generatedImage.url,
					base64Data: generatedImage.base64Data,
					mimeType: generatedImage.mimeType,
					prompt: prompt,
					style: 'ai_generated',
					dimensions: { width: 1024, height: 1024 },
					processedAt: new Date().toISOString(),
				};

			case 'image-to-image':
				// Generate new image from existing image + prompt
				if (!imageBuffer) {
					throw new Error(
						'Image is required for image-to-image mode'
					);
				}

				console.log('Transforming image with prompt...');
				const transformedImage = await generateImageFromImage(
					imageBuffer,
					imageMimeType,
					prompt,
					taskId
				);

				return {
					mode: 'image-to-image',
					message: `Successfully transformed image with prompt: "${prompt}"`,
					originalImageName: imageFilename,
					generatedImageUrl: transformedImage.url,
					base64Data: transformedImage.base64Data,
					mimeType: transformedImage.mimeType,
					prompt: prompt,
					transformation: 'ai_remix',
					processedAt: new Date().toISOString(),
				};

			case 'image-to-desc':
				// Use Gemini Vision API for real image description
				if (!imageBuffer) {
					throw new Error('Image is required for image-to-desc mode');
				}

				const model = genAI.getGenerativeModel({
					model: 'gemini-1.5-flash',
				});
				const imageForDesc = await bufferToBase64(
					imageBuffer,
					imageMimeType
				);
				let descPrompt =
					'Analyze this image in detail and provide a comprehensive description.';

				if (prompt) {
					descPrompt += ` Focus specifically on: ${prompt}`;
				}

				descPrompt +=
					' Include details about objects, people, colors, lighting, composition, mood, and any text visible in the image.';

				const result = await model.generateContent([
					descPrompt,
					imageForDesc,
				]);

				const description = result.response.text();

				// Extract some basic analysis from the description
				const words = description.toLowerCase().split(/\s+/);
				const detectedObjects = [];
				const colors = [];

				// Simple keyword extraction (can be improved)
				const objectKeywords = [
					'person',
					'people',
					'woman',
					'man',
					'child',
					'building',
					'car',
					'tree',
					'flower',
					'animal',
					'cat',
					'dog',
				];
				const colorKeywords = [
					'red',
					'blue',
					'green',
					'yellow',
					'purple',
					'orange',
					'pink',
					'brown',
					'black',
					'white',
					'gray',
				];

				objectKeywords.forEach((keyword) => {
					if (words.some((word) => word.includes(keyword))) {
						detectedObjects.push(keyword);
					}
				});

				colorKeywords.forEach((keyword) => {
					if (words.some((word) => word.includes(keyword))) {
						colors.push(keyword);
					}
				});

				return {
					mode: 'image-to-desc',
					message:
						'Successfully analyzed and described the image using AI',
					description: description,
					detectedObjects:
						detectedObjects.length > 0
							? detectedObjects
							: ['various objects'],
					colors: colors.length > 0 ? colors : ['multiple colors'],
					confidence: 0.95,
					originalPrompt: prompt || null,
					processedAt: new Date().toISOString(),
				};

			default:
				throw new Error(`Unsupported mode: ${mode}`);
		}
	} catch (error) {
		console.error(`Error in ${mode} processing:`, error);
		throw new Error(`Failed to process ${mode}: ${error.message}`);
	}
}

// Error handling middleware
app.use((error, req, res, next) => {
	if (error instanceof multer.MulterError) {
		if (error.code === 'LIMIT_FILE_SIZE') {
			return res.status(400).json({ error: 'File too large' });
		}
	}

	console.error('Unexpected error:', error);
	res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
	res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
	console.log(`Image Prompt Server is running on port ${PORT}`);
	console.log(`Health check: http://localhost:${PORT}/health`);
	console.log(`Upload endpoint: http://localhost:${PORT}/process`);
});

module.exports = app;
