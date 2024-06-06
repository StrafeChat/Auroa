const express = require("express");
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');   
const rateLimit = require('express-rate-limit');
const { createClient } = require('redis');
require("dotenv").config();

const app = express();
app.use(cors({
    origin: process.env.FRONTEND
}));

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
};

const CACHE_TTL = 3600;

const redisClient = createClient();

redisClient.connect().then(() => {
    console.log('[DATABASE] Connected to Redis.');
}).catch(err => {
    console.error('Redis connection error:', err);
});

// const limiter = rateLimit({
//     windowMs: 15 * 60 * 1000, 
//     max: 350,
//     message: "Too many requests from this IP, please try again after 15 minutes"
// });

// app.use(limiter);

app.get("/embed", async (req, res) => {
    const url = req.query.url;
    if (!url) {
        return res.status(400).json({ message: "You must provide a URL to get the metadata from!" });
    }

    try {
        const cachedData = await redisClient.get(url);
        if (cachedData) {
            return res.status(200).json(JSON.parse(cachedData));
        } else {
            const { data } = await axios.get(url, { headers });

            const $ = cheerio.load(data);
            const metadata = {};

            $('meta').each((index, element) => {
                const name = $(element).attr('name') || $(element).attr('property');
                const content = $(element).attr('content');
                if (name && content) {
                    metadata[name.toLowerCase()] = content;
                }
            });

            metadata.title = $('title').text() || null;
            metadata.description = $('meta[name="description"]').attr('content') || null;
            metadata.keywords = $('meta[name="keywords"]').attr('content') || null;

            await redisClient.setEx(url, CACHE_TTL, JSON.stringify(metadata));

            return res.status(200).json(metadata);
        }
    } catch (error) {
        return res.status(500).json({ message: 'Error fetching metadata.' });
    }
});

app.listen(process.env.PORT, () => {
    console.log(`[SERVER] Listening on port ${process.env.PORT}.`);
});
