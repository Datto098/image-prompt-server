const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();
const fs = require('fs');

async function testReferenceTypes() {
  const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
  const testImageBase64 = fs.readFileSync('test-image.png').toString('base64');

  const typesToTest = [
    { type: 'CONTROL_IMAGE', controlType: 'CANNY' },
    { type: 'SUBJECT_REFERENCE' },
    { type: 'STYLE_REFERENCE' }
  ];

  for (const t of typesToTest) {
    try {
      console.log(`Testing type: ${t.type} ${t.controlType || ''}`);
      const response = await client.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: 'A person in a futuristic suit with a neon city background',
        config: {
          numberOfImages: 1,
          referenceImages: [
            {
              image: {
                imageBytes: testImageBase64,
                mimeType: 'image/png'
              },
              referenceType: t.type,
              ...(t.controlType ? { controlType: t.controlType } : {})
            }
          ]
        }
      });
      console.log(`Success for ${t.type}:`, response.generatedImages.length > 0);
    } catch (error) {
      console.error(`Error for ${t.type}:`, error.message);
    }
  }
}

testReferenceTypes();
