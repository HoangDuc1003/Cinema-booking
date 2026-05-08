import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import connectDB from './configs/db.js';
import { clerkMiddleware } from '@clerk/express'
import dns from "node:dns/promises";
import { inngest ,functions } from './inngest/index.js';
import {serve} from 'inngest/express'

//dns
dns.setServers(["1.1.1.1", "1.0.0.1"]);

const app = express();
const port  = 3000;

await connectDB()


// 2. MIDDLEWARE KHÁC
app.use(express.json())
app.use(cors())

app.use('/api/inngest', serve({ client: inngest, functions }));

app.use(clerkMiddleware())


// api route 
app.get('/',(req,res)=>res.send('Server is live!'))

app.listen(port, ()=> console.log(`Server is listening at http://localhost:${port}`));

export default app;