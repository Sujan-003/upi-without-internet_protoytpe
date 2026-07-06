import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRouter from './routes/api.routes.js';
import dashboardRouter from './routes/dashboard.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json());

// Log requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Serve static assets from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Routers
app.use('/', dashboardRouter);
app.use('/api', apiRouter);

export default app;
