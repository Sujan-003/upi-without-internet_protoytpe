import app from './app.js';
import demoService from './services/demo.service.js';

const PORT = process.env.PORT || 8080;

async function start() {
  try {
    // Fallback seed of demo accounts on startup
    await demoService.seedAccounts();

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
