const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

async function checkType() {
  const client = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
  try {
    const response = await client.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: 'A small cat'
    });
    const img = response.generatedImages[0].image;
    console.log('Type of imageBytes:', typeof img.imageBytes);
    console.log('Is it an instance of Buffer?', img.imageBytes instanceof Buffer);
    console.log('Is it an instance of Uint8Array?', img.imageBytes instanceof Uint8Array);
    if (typeof img.imageBytes === 'string') {
        console.log('First 50 chars of string:', img.imageBytes.substring(0, 50));
    } else {
        console.log('Length:', img.imageBytes.length);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

checkType();
