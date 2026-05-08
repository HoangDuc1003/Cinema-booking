import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import connectDB from './configs/db.js';
import { clerkMiddleware } from '@clerk/express'
import dns from "node:dns/promises";
import { inngest, functions } from './inngest/index.js';
import { serve } from 'inngest/express'
import showRouter from './routes/showRoutes.js';

// Use Cloudflare DNS to avoid resolution issues on serverless
dns.setServers(["1.1.1.1", "1.0.0.1"]);

const app = express();
const port = process.env.PORT || 3000;

// Connect to database
await connectDB()

// Core middleware
app.use(express.json())
app.use(cors())
app.use(clerkMiddleware())
//api routes
app.get('/', (req, res) => res.send('Server is live!'))
app.use('/api/inngest', serve({ client: inngest, functions }));
app.use('/api/show',showRouter)


app.listen(port, () => console.log(`Server is listening at http://localhost:${port}`));

export default app;