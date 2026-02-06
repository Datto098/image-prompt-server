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

// Initialize Google AI (Legacy)
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Initialize Google GenAI (Veo)
const { GoogleGenAI, types } = require('@google/genai');
const googleGenAiClient = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

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
						// Return base64 data directly for serverless
						const imageData = part.inlineData.data;
						const mimeType =
							part.inlineData.mimeType || 'image/png';
						const extension = mimeType.split('/')[1] || 'png';
						const filename = `generated-${taskId}.${extension}`;

						console.log(`Generated image for task: ${taskId}`);
						return {
							filename,
							imageData: {
								base64Data: imageData,
								mimeType,
							},
							url: `/image/${taskId}`,
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
							imageData: {
								base64Data: imageData,
								mimeType,
							},
							url: `/image/${taskId}`,
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

// Helper for Veo Video Generation
async function generateVideo(params, taskId) {
	console.log('Starting video generation with params:', JSON.stringify(params, null, 2));

	try {
		const config = {
			numberOfVideos: 1,
			resolution: params.resolution || '720p', // Default to 720p
		};

		// Aspect ratio is not used for extend_video
		if (params.mode !== 'extend_video') {
			config.aspectRatio = params.aspectRatio || '16:9';
		}

		if (params.fps) {
			config.fps = parseInt(params.fps);
		}

		const generateVideoPayload = {
			model: params.model || 'veo-3.1-fast-generate-preview', // Default to Veo 2.0
            // model: 'veo-2.0-generate-preview',
			config: config,
		};

		if (params.prompt) {
			generateVideoPayload.prompt = params.prompt;
		}

		// Handle different modes
		if (params.mode === 'frames_to_video') {
			// Handle start frame
			if (params.startFrame) {
				generateVideoPayload.image = {
					imageBytes: params.startFrame.base64,
					mimeType: params.startFrame.mimeType,
				};
				console.log('Added start frame');
			}

            // Handle end frame (optional)
            if (params.endFrame) {
                 generateVideoPayload.config.lastFrame = {
                    imageBytes: params.endFrame.base64,
                    mimeType: params.endFrame.mimeType,
                };
                console.log('Added end frame');
            }

		} else if (params.mode === 'references_to_video') {
			// This mode allows multiple reference images and a style image
            // NOTE: The Node.js SDK structure might differ slightly from the TS web SDK.
            // We'll follow the TS structure provided by the user as a guide.
            const referenceImages = [];

            if (params.referenceImages && Array.isArray(params.referenceImages)) {
                for (const img of params.referenceImages) {
                    referenceImages.push({
                        image: {
                            imageBytes: img.base64,
                            mimeType: img.mimeType
                        },
                        referenceType: 'ASSET' // Using string literal as enum might not be available consistently on server import
                    });
                }
            }

            if (params.styleImage) {
                 referenceImages.push({
                        image: {
                            imageBytes: params.styleImage.base64,
                            mimeType: params.styleImage.mimeType
                        },
                        referenceType: 'STYLE'
                    });
            }

            if (referenceImages.length > 0) {
                 generateVideoPayload.config.referenceImages = referenceImages;
            }

		} else if (params.mode === 'extend_video') {
             // For extend video, we need an input video.
             // The user's example passes a 'video' object.
             // In a REST API context, we might receive a 'video' file (upload) or a 'videoUri' (if previously generated).
             // For now, let's assume we might handle uploaded video -> base64 or similar if the API supports it,
             // or extended from a previous task ID (not fully implemented in this MVP without persistent storage).
             // Skipping complex video upload for now unless requested.
             throw new Error('Extend video mode not fully implemented yet in this server version.');
		}

		console.log('Submitting video generation request...');
		let operation = await googleGenAiClient.models.generateVideos(generateVideoPayload);
		console.log('Video generation operation started. Polling for results...');

		// Poll for completion
        // Note: The SDK might have a wait helper, but we'll use the loop for control.
		while (!operation.done) {
			await new Promise((resolve) => setTimeout(resolve, 5000)); // Poll every 5 seconds
			console.log('...Generating video...');
			operation = await googleGenAiClient.operations.getVideosOperation({ operation: operation });
		}

		if (operation.response && operation.response.generatedVideos && operation.response.generatedVideos.length > 0) {
			const video = operation.response.generatedVideos[0].video;
			const videoUri = video.uri;
            console.log('Video generated. URI:', videoUri);

            // Fetch the video content
            // IMPORTANT: Request needs the API Key appended
            const fetchUrl = `${videoUri}&key=${process.env.GOOGLE_API_KEY}`;
            const response = await axios.get(fetchUrl, { responseType: 'arraybuffer' });
            const videoBuffer = Buffer.from(response.data);

            const videoFilename = `generated-video-${taskId}.mp4`;

			return {
				filename: videoFilename,
                uri: videoUri, // Keep the Google URI if needed
                buffer: videoBuffer,
				mimeType: 'video/mp4',
			};

		} else {
            console.error('Operation failed or no videos returned:', operation);
			throw new Error('Video generation failed or returned no videos.');
		}

	} catch (error) {
		console.error('Error in generateVideo:', error);
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
					// Use buffer directly from download result
					imageBuffer = downloadResult.buffer;
					imageMimeType = downloadResult.contentType || 'image/jpeg';
					imageFilename = downloadResult.filename;
					isDownloadedImage = true;
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
		const result = await processWithMode(
			mode,
			imageBuffer,
			imageMimeType,
			imageFilename,
			prompt,
			taskId
		);

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

// Serve generated images from memory
app.get('/image/:taskId', (req, res) => {
	const taskId = req.params.taskId;
	const result = processingResults.get(taskId);

	if (!result || !result.result.imageData) {
		return res.status(404).json({ error: 'Image not found' });
	}

	try {
		const { base64Data, mimeType } = result.result.imageData;
		const imageBuffer = Buffer.from(base64Data, 'base64');

		res.set({
			'Content-Type': mimeType,
			'Content-Length': imageBuffer.length,
			'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
		});

		res.send(imageBuffer);
	} catch (error) {
		console.error('Error serving image:', error);
		res.status(500).json({ error: 'Failed to serve image' });
	}
});

// Serve generated videos from memory
app.get('/video/:taskId', (req, res) => {
    const taskId = req.params.taskId;
    const result = processingResults.get(taskId);

    if (!result || !result.result.videoBuffer) {
        return res.status(404).json({ error: 'Video not found' });
    }

    try {
        const videoBuffer = result.result.videoBuffer;

        res.set({
            'Content-Type': 'video/mp4',
            'Content-Length': videoBuffer.length,
            'Cache-Control': 'public, max-age=31536000',
        });

        res.send(videoBuffer);
    } catch (error) {
        console.error('Error serving video:', error);
        res.status(500).json({ error: 'Failed to serve video' });
    }
});

// Generate Video Endpoint
app.post('/generate-video', upload.fields([
    { name: 'startFrame', maxCount: 1 },
    { name: 'endFrame', maxCount: 1 },
    { name: 'referenceImages', maxCount: 5 },
    { name: 'styleImage', maxCount: 1 }
]), async (req, res) => {
    try {
        const { 
            prompt, 
            mode, 
            resolution, 
            aspectRatio, 
            model, 
            fps,
            startFrameUrl,
            endFrameUrl,
            styleImageUrl
        } = req.body;
        
        const taskId = uuidv4();

        console.log(`Received video generation request: ${mode}, Task ID: ${taskId}`);

        // Prepare parameters
        const params = {
            prompt,
            mode: mode || 'text_to_video', // Default
            resolution: resolution || '720p',
            aspectRatio: aspectRatio || '16:9',
            model: model || 'veo-3.1-fast-generate-preview',
            fps: fps
        };

        // Helper to process image input (file or URL)
        const processImageInput = async (fileInput, urlInput, taskId, type) => {
            if (fileInput) {
                return {
                    base64: fileInput[0].buffer.toString('base64'),
                    mimeType: fileInput[0].mimetype
                };
            } else if (urlInput) {
                console.log(`Downloading ${type} from URL: ${urlInput}`);
                try {
                    const downloadResult = await downloadImageFromUrl(urlInput, taskId);
                    return {
                        base64: downloadResult.buffer.toString('base64'),
                        mimeType: downloadResult.contentType
                    };
                } catch (error) {
                    console.error(`Failed to download ${type}:`, error);
                    throw new Error(`Failed to download ${type}: ${error.message}`);
                }
            }
            return null;
        };

        // Processing Start Frame
        params.startFrame = await processImageInput(
            req.files?.startFrame, 
            startFrameUrl, 
            taskId, 
            'start frame'
        );

        // Processing End Frame
        params.endFrame = await processImageInput(
            req.files?.endFrame, 
            endFrameUrl, 
            taskId, 
            'end frame'
        );

        // Processing Style Image
        params.styleImage = await processImageInput(
            req.files?.styleImage, 
            styleImageUrl, 
            taskId, 
            'style image'
        );

        // Handle Reference Images (Files only for now, URLs checks can be added if needed)
        if (req.files && req.files.referenceImages) {
             params.referenceImages = req.files.referenceImages.map(file => ({
                 base64: file.buffer.toString('base64'),
                 mimeType: file.mimetype
            }));
        }

        // Call generation function
        const videoResult = await generateVideo(params, taskId);

        // Store result
		processingResults.set(taskId, {
			taskId,
			status: 'completed',
			mode: params.mode,
			prompt: params.prompt,
			result: {
                message: 'Video generated successfully',
                filename: videoResult.filename,
                videoBuffer: videoResult.buffer, // Verify memory usage for large videos
                uri: videoResult.uri,
                url: `/video/${taskId}`
            },
			timestamp: new Date().toISOString(),
		});

        res.json({
            success: true,
            taskId,
            status: 'completed',
            result: {
                message: 'Video generated successfully',
                videoUrl: `/video/${taskId}`,
                dashboardUrl: videoResult.uri
            }
        });

    } catch (error) {
        console.error('Video generation error:', error);
        res.status(500).json({
            error: 'Failed to generate video',
            details: error.message
        });
    }
});

// List all processing results
app.get('/results', (req, res) => {
	const results = Array.from(processingResults.values());
	res.json({
		total: results.length,
		results,
	});
});

// Delete a specific result
app.delete('/result/:taskId', (req, res) => {
	const taskId = req.params.taskId;

	if (processingResults.has(taskId)) {
		const result = processingResults.get(taskId);

		// Note: No file cleanup needed in serverless environment

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

		// Generate filename for reference
		const urlPath = url.pathname;
		const originalExt = path.extname(urlPath) || '.jpg';
		const filename = `url-${taskId}-${Date.now()}${originalExt}`;

		// Convert response to buffer for serverless processing
		const chunks = [];
		response.data.on('data', (chunk) => chunks.push(chunk));

		// Return promise that resolves when download is complete
		return new Promise((resolve, reject) => {
			response.data.on('end', () => {
				const buffer = Buffer.concat(chunks);
				resolve({ buffer, filename, contentType });
			});
			response.data.on('error', (error) => {
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
async function processWithMode(
	mode,
	imageBuffer,
	imageMimeType,
	imageFilename,
	prompt,
	taskId
) {
	console.log(`Processing mode: ${mode}`);
	console.log(`Image filename: ${imageFilename}`);
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
					imageData: generatedImage.imageData,
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
					imageData: transformedImage.imageData,
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
