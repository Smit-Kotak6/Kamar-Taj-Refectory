require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`⚡ The Kamar-Taj Refectory Backend is live on port ${PORT}`);
  console.log(`📡 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`🕒 System Timezone configured: ${process.env.COLLEGE_TIMEZONE || 'Asia/Kolkata'}`);
  console.log(`=======================================================`);
});