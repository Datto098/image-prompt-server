const fs = require('fs');
require('dotenv').config();

async function listModels() {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();
    const model = data.models.find(m => m.name.includes('gemini-3-pro-image-preview'));
    if (model) {
        fs.writeFileSync('gemini3_details.txt', `${model.name}: ${model.supportedGenerationMethods.join(', ')}`);
    } else {
        fs.writeFileSync('gemini3_details.txt', 'Model not found');
    }
  } catch (error) {
    fs.writeFileSync('gemini3_details.txt', 'Error: ' + error.message);
  }
}

listModels();
