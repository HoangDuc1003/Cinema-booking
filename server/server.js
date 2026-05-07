import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import connectDB from './configs/db.js';
import { clerkMiddleware } from '@clerk/express'

const app = express();
const port  = 3000;

await connectDB()

//middleware
app.use(express.json())
app.use(cors())
app.use(clerkMiddleware())

//api route 
app.get('/',(req,res)=>res.send('Server is live!'))
app.listen(port, ()=> console.log(`Server is listening at http://localhost:${port}`));

