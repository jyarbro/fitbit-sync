const express = require('express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

console.log('Starting server...');
console.log(`Environment variables loaded. PORT=${PORT}`);

app.get('/health', (req, res) => {
  console.log('Health check received');
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.status(200).send('Fitbit Sync API is running');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});