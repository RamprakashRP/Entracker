/* server/index.ts */
import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { google, Auth } from 'googleapis';
import { AzureOpenAI } from 'openai';
import axios from 'axios';
import multer from 'multer';
import FormData from 'form-data';
import fs from 'fs';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const PORT = process.env.PORT || 5000;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org';

const azureOpenAI = new AzureOpenAI({ 
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview',
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o-mini'
});

const SHEET_CONFIG: { [key: string]: { sheetName: string; range: string; columns: string[] } } = {
    series: { sheetName: 'Series', range: 'Series!A:J', columns: ['series_name', 'series_status', 'season_status', 'watched_till', 'next_season', 'expected_on', 'update', 'watched', 'release_date'] },
    movie: { sheetName: 'Movies', range: 'Movies!A:H', columns: ['movies_name', 'franchise', 'watched_till', 'next_part', 'expected_on', 'update', 'watched', 'release_date'] },
    anime: { sheetName: 'Anime', range: 'Anime!A:J', columns: ['anime_name', 'series_status', 'season_status', 'watched_till', 'next_season', 'expected_on', 'update', 'watched', 'release_date'] },
    anime_movie: { sheetName: 'Anime Movies', range: 'Anime Movies!A:H', columns: ['movies_name', 'franchise', 'watched_till', 'next_part', 'expected_on', 'update', 'watched', 'release_date'] }
};

const mediaCache: { [key: string]: { data: any, timestamp: number } } = {};
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

const posterCache: { [key: string]: { path: string | null, timestamp: number } } = {};
const POSTER_CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

const getSheetsClient = async () => {
    let authOptions: any = { scopes: 'https://www.googleapis.com/auth/spreadsheets' };
    if (process.env.GOOGLE_CREDENTIALS_BASE64) {
        const credentialsJson = Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf8');
        authOptions.credentials = JSON.parse(credentialsJson);
    } else {
        authOptions.keyFile = 'credentials.json';
    }
    const auth = new google.auth.GoogleAuth(authOptions);
    const client = await auth.getClient();
    return google.sheets({ version: 'v4', auth: client as Auth.OAuth2Client });
};

const getPromptForMediaType = (mediaType: string, mediaName: string) => {
    const commonSystemMessage = { role: 'system' as const, content: `You are a media information assistant. Your response MUST strictly be a JSON object with specific keys and formats.` };
    let userMessageContent = `Get details for the ${mediaType}: "${mediaName}". `;
    const commonKeys = `"expected_on" (string, "Month Year" or "Available"), "release_date" (string, in YYYY-MM-DD format).`;
    if (mediaType.includes('movie')) {
        userMessageContent += `JSON keys: "next_part" (string, "Yes" or "No").`;
    } else {
        userMessageContent += `JSON keys: "series_status" (string, "On Going" or "Completed"), "season_status" (string, "Completed", "On Going", or "Upcoming"), "next_season" (string, "Yes" or "No"), ${commonKeys}`;
    }
    return [commonSystemMessage, { role: 'user' as const, content: userMessageContent }];
};

const transformResponse = (response: any, watchedTill: string, mediaType: string, watched: string) => {
    const data = { ...response };
    if (typeof data.series_status === 'string') data.series_status = (data.series_status.toLowerCase().includes('complete')) ? 'Completed' : 'On Going';
    data.watched_till = mediaType.includes('movie') ? (watched === 'True' ? 'Watched' : 'Not Watched') : watchedTill;
    data.update = new Date().toISOString();
    data.watched = watched;
    return data;
};

app.get('/api/search-tmdb', async (req: Request, res: Response) => {
    const { mediaType, name } = req.query;
    if (!mediaType || !name) { return res.status(400).json({ error: 'mediaType and name are required.' }); }
    if (!TMDB_API_KEY) return res.status(500).json({ error: 'TMDB key not configured.' });

    const searchPath = mediaType.toString().includes('movie') ? 'movie' : 'tv';
    try {
        const searchUrl = `${TMDB_BASE_URL}/3/search/${searchPath}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(name.toString())}`;
        const searchResponse = await axios.get(searchUrl);
        
        const results = searchResponse.data.results.map((item: any) => ({
            id: item.id,
            name: item.title || item.name,
            release_date: item.release_date || item.first_air_date,
        }));

        res.status(200).json({ data: results });
    } catch (error) {
        res.status(500).json({ error: 'Failed to search TMDB.' });
    }
});

app.get('/api/image-proxy', async (req: Request, res: Response) => {
    const imageUrl = req.query.url as string;
    if (!imageUrl) return res.status(400).send('URL required');
    try {
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data, 'binary');
        res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
        res.send(buffer);
    } catch (error) {
        res.status(500).send('Failed to fetch image');
    }
});

app.post('/api/add-media', async (req: Request, res: Response) => {
    const { mediaType, tmdbId, watched, watchedTill } = req.body;
    if (!mediaType || !tmdbId || watched === undefined) {
        return res.status(400).json({ error: 'mediaType, tmdbId, and watched are required.' });
    }

    try {
        const sheets = await getSheetsClient();
        const sheetConfig = SHEET_CONFIG[mediaType];
        if (!sheetConfig) throw new Error(`Invalid mediaType: ${mediaType}`);

        const searchPath = mediaType.includes('movie') ? 'movie' : 'tv';
        const detailsUrl = `${TMDB_BASE_URL}/3/${searchPath}/${tmdbId}?api_key=${TMDB_API_KEY}`;
        const detailsResponse = await axios.get(detailsUrl);
        const tmdbDetails = detailsResponse.data;
        const officialName = tmdbDetails.title || tmdbDetails.name;
        
        const existingMoviesResponse = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: sheetConfig.range });
        const existingMovieNames = new Set(existingMoviesResponse.data.values?.slice(1).map(row => row[0].toLowerCase()) || []);
        if (existingMovieNames.has(officialName.toLowerCase())) {
            return res.status(409).json({ error: `"${officialName}" is already in your list.` });
        }
        
        const prompt = getPromptForMediaType(mediaType, officialName);
        const aiResponse = await azureOpenAI.chat.completions.create({ messages: prompt as any, model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o-mini' });
        const content = aiResponse.choices[0]?.message?.content || '{}';
        const mediaData = JSON.parse(content.match(/({[\s\S]*})/)?.[1] || '{}');

        const collection = tmdbDetails.belongs_to_collection;
        mediaData.franchise = collection ? collection.name.replace(/ Collection/i, '').trim() : "Standalone";
        mediaData.release_date = tmdbDetails.release_date || tmdbDetails.first_air_date;

        const transformedData = transformResponse(mediaData, watchedTill, mediaType, watched);
        const nameKey = mediaType.includes('movie') ? 'movies_name' : `${mediaType}_name`;
        transformedData[nameKey] = officialName;
        
        const allNewRows = [sheetConfig.columns.map(col => transformedData[col as keyof typeof transformedData] || '')];

        if (collection?.id) {
            (async () => {
                const collectionUrl = `${TMDB_BASE_URL}/3/collection/${collection.id}?api_key=${TMDB_API_KEY}`;
                const collectionDetails = await axios.get(collectionUrl);
                const franchiseMovies = collectionDetails.data.parts || [];
                const newRows: string[][] = [];
                for (const movie of franchiseMovies) {
                    if (movie.title && movie.id !== tmdbId && !existingMovieNames.has(movie.title.toLowerCase())) {
                        newRows.push(sheetConfig.columns.map(col => {
                           if(col === nameKey) return movie.title;
                           if(col === 'franchise') return mediaData.franchise;
                           if(col === 'watched_till') return 'Not Watched';
                           if(col === 'next_part') return 'Yes';
                           if(col === 'update') return new Date().toISOString();
                           if(col === 'watched') return 'False';
                           if(col === 'release_date') return movie.release_date || 'N/A';
                           return '';
                        }));
                    }
                }
                if(newRows.length > 0) {
                     await sheets.spreadsheets.values.append({
                        spreadsheetId: SPREADSHEET_ID, range: sheetConfig.range, valueInputOption: 'USER_ENTERED',
                        requestBody: { values: newRows },
                    });
                }
            })();
        }

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID, range: sheetConfig.range, valueInputOption: 'USER_ENTERED',
            requestBody: { values: allNewRows },
        });

        delete mediaCache[mediaType];
        res.status(201).json({ message: 'Media added successfully!', data: transformedData });
    } catch (error: any) {
        console.error("Add/Update Error:", error);
        res.status(500).json({ error: error.message || 'An error occurred.' });
    }
});

app.get('/api/get-media/:mediaType', async (req, res) => {
    const { mediaType } = req.params;
    const config = SHEET_CONFIG[mediaType];
    if (!config) { return res.status(400).json({ error: 'Invalid media type.' }); }
    
    if (mediaCache[mediaType] && (Date.now() - mediaCache[mediaType].timestamp < CACHE_DURATION_MS)) {
        return res.status(200).json({ data: mediaCache[mediaType].data });
    }

    try {
        const sheets = await getSheetsClient();
        const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: config.range });
        const rows = response.data.values;
        if (rows && rows.length > 1) {
            const header = rows[0];
            const data = rows.slice(1).map((row, index) => {
                const rowData: { [key: string]: any } = { row_index: index + 2 };
                header.forEach((key, i) => { rowData[key.toLowerCase().replace(/ /g, '_')] = row[i]; });
                return rowData;
            });
            mediaCache[mediaType] = { data, timestamp: Date.now() };
            res.status(200).json({ data });
        } else {
            mediaCache[mediaType] = { data: [], timestamp: Date.now() };
            res.status(200).json({ data: [] });
        }
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch data.' });
    }
});

app.get('/api/franchises/:mediaType', async (req, res) => {
    const { mediaType } = req.params;
    const config = SHEET_CONFIG[mediaType];
    if (!mediaType.includes('movie')) return res.status(400).json({ error: 'Endpoint only for movies.' });
    try {
        const sheets = await getSheetsClient();
        const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: config.range });
        const rows = response.data.values;
        if (rows && rows.length > 1) {
            const header = rows[0];
            const franchiseIndex = header.indexOf('Franchise');
            if (franchiseIndex === -1) return res.status(500).json({ error: "'Franchise' column not found." });
            const franchises = rows.slice(1).map(row => row[franchiseIndex]);
            const uniqueFranchises = [...new Set(franchises.filter(f => f && f.toLowerCase() !== 'standalone'))];
            res.status(200).json({ data: uniqueFranchises });
        } else {
            res.status(200).json({ data: [] });
        }
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch franchises.' });
    }
});

app.get('/api/franchise/:mediaType/:name', async (req: Request, res: Response) => {
    const { mediaType, name } = req.params;
    const config = SHEET_CONFIG[mediaType as string];

    if (!config || !mediaType.includes('movie')) {
        return res.status(400).json({ error: 'Invalid media type for franchises.' });
    }

    try {
        const sheets = await getSheetsClient();
        const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: config.range });

        const rows = response.data.values;
        if (!rows || rows.length <= 1) {
            return res.status(404).json({ error: 'No movies found for this franchise in the sheet.' });
        }
        
        const header = rows[0];
        // **THE FIX**: Make the franchise name comparison case-insensitive.
        const franchiseMoviesInSheet = rows.slice(1).map((row, index) => {
            const rowData: { [key: string]: any } = { row_index: index + 2 };
            header.forEach((key, i) => { rowData[key.toLowerCase().replace(/ /g, '_')] = row[i]; });
            return rowData;
        }).filter(movie => movie.franchise?.toLowerCase() === name.toLowerCase());

        if (franchiseMoviesInSheet.length === 0) {
             return res.status(404).json({ error: 'No movies found for this franchise in the sheet.' });
        }

        const searchUrl = `${TMDB_BASE_URL}/3/search/collection?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(name)}`;
        const searchResponse = await axios.get(searchUrl);
        const collection = searchResponse.data.results[0];
        
        let collectionDetails = {};
        if (collection?.id) {
            const collectionUrl = `${TMDB_BASE_URL}/3/collection/${collection.id}?api_key=${TMDB_API_KEY}`;
            const detailsResponse = await axios.get(collectionUrl);
            collectionDetails = {
                overview: detailsResponse.data.overview,
                poster_path: detailsResponse.data.poster_path ? `/api/image-proxy?url=https://image.tmdb.org/t/p/w500${detailsResponse.data.poster_path}` : null,
                name: detailsResponse.data.name
            };
        }

        res.status(200).json({ 
            details: collectionDetails,
            movies: franchiseMoviesInSheet
        });

    } catch (error: any) {
        console.error(`Error fetching movies for franchise ${name}:`, error);
        res.status(500).json({ error: 'Failed to fetch data from Google Sheets or TMDB.' });
    }
});

app.get('/api/details/:mediaType/:name', async (req, res) => {
    const { mediaType, name } = req.params;
    if (!TMDB_API_KEY) return res.status(500).json({ error: 'TMDB key not configured.' });
    const searchPath = mediaType.includes('movie') ? 'movie' : 'tv';
    try {
        const searchUrl = `${TMDB_BASE_URL}/3/search/${searchPath}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(name)}`;
        const searchResponse = await axios.get(searchUrl);
        const item = searchResponse.data.results[0];
        if (!item) return res.status(404).json({ error: 'Media not found on TMDB.' });
        const detailsUrl = `${TMDB_BASE_URL}/3/${searchPath}/${item.id}?api_key=${TMDB_API_KEY}&append_to_response=watch/providers`;
        const detailsResponse = await axios.get(detailsUrl);
        const details = detailsResponse.data;
        const formattedData = {
            name: details.name || details.title, overview: details.overview,
            poster_path: details.poster_path ? `/api/image-proxy?url=https://image.tmdb.org/t/p/w500${details.poster_path}` : null,
            vote_average: details.vote_average, genres: details.genres.map((g: any) => g.name),
            providers: details['watch/providers']?.results?.US?.flatrate || details['watch/providers']?.results?.IN?.flatrate || [],
        };
        res.status(200).json({ data: formattedData });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch details from TMDB.' });
    }
});

app.get('/api/poster/:mediaType/:name', async (req, res) => {
    const { mediaType, name } = req.params;
    const cacheKey = `${mediaType}_${name.toLowerCase()}`;
    
    if (posterCache[cacheKey] && (Date.now() - posterCache[cacheKey].timestamp < POSTER_CACHE_DURATION_MS)) {
        return res.status(200).json({ poster_path: posterCache[cacheKey].path });
    }

    if (!TMDB_API_KEY) return res.status(500).json({ error: 'TMDB key not configured.' });
    
    const searchPath = mediaType.includes('movie') ? 'movie' : 'tv';
    try {
        const searchUrl = `${TMDB_BASE_URL}/3/search/${searchPath}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(name)}`;
        const searchResponse = await axios.get(searchUrl);
        const item = searchResponse.data.results[0];
        
        let poster_path = null;
        if (item && item.poster_path) {
            poster_path = `/api/image-proxy?url=https://image.tmdb.org/t/p/w500${item.poster_path}`;
        }
        
        posterCache[cacheKey] = { path: poster_path, timestamp: Date.now() };
        res.status(200).json({ poster_path });
    } catch (error: any) {
        console.error(`Poster fetch error for ${name}:`, error.message);
        res.status(500).json({ error: 'Failed to fetch poster from TMDB.' });
    }
});

app.put('/api/update-media', async (req, res) => {
    const { rowIndex, mediaType, name, watched, watchedTill } = req.body;
    if (!rowIndex || !mediaType) { return res.status(400).json({ error: 'rowIndex and mediaType are required.' }); }

    try {
        const sheets = await getSheetsClient();
        const sheetConfig = SHEET_CONFIG[mediaType];
        if (!sheetConfig) throw new Error(`Invalid mediaType: ${mediaType}`);

        let mediaData: any = {};
        if (name) {
            try {
                const prompt = getPromptForMediaType(mediaType, name);
                const aiResponse = await azureOpenAI.chat.completions.create({ messages: prompt as any, model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o-mini' });
                const content = aiResponse.choices[0]?.message?.content || '{}';
                mediaData = JSON.parse(content.match(/({[\s\S]*})/)?.[1] || '{}');
            } catch (aiErr) {
                console.error("AI Status Fetch Error during Update:", aiErr);
            }
        }

        const transformedData = transformResponse(mediaData, watchedTill || '', mediaType, watched || 'False');
        const updates = [];

        for (let i = 0; i < sheetConfig.columns.length; i++) {
            const colName = sheetConfig.columns[i];
            const colLetter = String.fromCharCode('A'.charCodeAt(0) + i);
            let valueToUpdate = undefined;

            if (colName === (mediaType.includes('movie') ? 'movies_name' : `${mediaType}_name`) && name) {
                valueToUpdate = name;
            } else if (colName === 'watched' && watched !== undefined) {
                valueToUpdate = watched;
            } else if (colName === 'watched_till') {
                if (mediaType.includes('movie') && watched !== undefined) {
                    valueToUpdate = watched === 'True' ? 'Watched' : 'Not Watched';
                } else if (!mediaType.includes('movie') && watchedTill !== undefined) {
                    valueToUpdate = watchedTill;
                }
            } else if (colName === 'update') {
                valueToUpdate = new Date().toISOString();
            } else if (transformedData[colName] !== undefined && transformedData[colName] !== '') {
                valueToUpdate = transformedData[colName];
            }

            if (valueToUpdate !== undefined) {
                updates.push(sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID, range: `${sheetConfig.sheetName}!${colLetter}${rowIndex}`,
                    valueInputOption: 'USER_ENTERED', requestBody: { values: [[valueToUpdate]] }
                }));
            }
        }

        await Promise.all(updates);
        delete mediaCache[mediaType];
        res.status(200).json({ message: 'Update successful!' });
    } catch (error: any) {
        console.error("Update Error:", error);
        res.status(500).json({ error: 'Failed to update entry.' });
    }
});

app.get('/api/deepgram-key', (req: Request, res: Response) => {
    if (!process.env.DEEPGRAM_API_KEY) {
        return res.status(500).json({ error: 'Deepgram API Key is missing.' });
    }
    res.json({ key: process.env.DEEPGRAM_API_KEY });
});

// Used when we ALREADY have the text from live transcription, we just need to parse it with GPT-4
app.post('/api/voice-nlp', async (req: Request, res: Response) => {
    const { transcript } = req.body;
    if (!transcript) return res.status(400).json({ error: 'No transcript provided.' });

    try {
        const systemPrompt = { 
            role: 'system' as const, 
            content: `You are a voice command parser for a media tracking app. Extract the following from the user's spoken command:
            - mediaType: strictly one of "series", "movie", "anime", "anime_movie". (e.g. if they say "anime", it's anime. If they say "show", it's series. If they say "film", it's movie. Best guess if unspecified).
            - mediaName: the name of the show/movie.
            - watched: strictly "True" or "False". If the user says to put it in their "watchlist", set this to "False". If they imply they finished it completely, set to "True". If they are tracking progress, set to "False".
            - watchedTill: A string describing their progress. If it's a watchlist command, set this strictly to "Not Watched". If they specify progress, format it strictly as "Sxx Exx" (e.g., "Season 3 Episode 24" becomes "S03 E24". "Episode 5" becomes "S01 E05").
            Return ONLY a valid JSON object with these exactly 4 keys.` 
        };
        const userPrompt = { role: 'user' as const, content: `Command: "${transcript}"` };
        
        const aiResponse = await azureOpenAI.chat.completions.create({ 
            messages: [systemPrompt, userPrompt], 
            model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o-mini',
            response_format: { type: "json_object" }
        });
        
        const parsed = JSON.parse(aiResponse.choices[0]?.message?.content || '{}');
        
        if (!parsed.mediaName) {
            return res.status(400).json({ error: "Could not understand the media name." });
        }

        const searchPath = parsed.mediaType.includes('movie') ? 'movie' : 'tv';
        const searchUrl = `${TMDB_BASE_URL}/3/search/${searchPath}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(parsed.mediaName)}`;
        const searchResponse = await axios.get(searchUrl);
        const item = searchResponse.data.results[0];
        
        if (!item) {
             return res.status(404).json({ error: `Could not find "${parsed.mediaName}" on TMDB.` });
        }

        res.status(200).json({
            mediaType: parsed.mediaType,
            tmdbId: item.id,
            watched: parsed.watched,
            watchedTill: parsed.watchedTill,
            parsedName: parsed.mediaName,
            officialName: item.title || item.name,
            transcript: transcript
        });
    } catch (error: any) {
        console.error("Voice parse error:", error);
        res.status(500).json({ error: 'Failed to process voice command.' });
    }
});

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.post('/api/voice-parse', upload.single('audio'), async (req: Request, res: Response) => {
    let transcript = req.body.transcript;

    if (req.file) {
        if (!process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY) {
            return res.status(500).json({ error: 'No STT API key configured (GROQ_API_KEY or OPENAI_API_KEY).' });
        }
        
        try {
            const formData = new FormData();
            formData.append('file', req.file.buffer, {
                filename: req.file.originalname || 'audio.webm',
                contentType: req.file.mimetype || 'audio/webm'
            });
            formData.append('model', process.env.GROQ_API_KEY ? 'whisper-large-v3' : 'whisper-1');
            
            const sttUrl = process.env.GROQ_API_KEY 
                ? 'https://api.groq.com/openai/v1/audio/transcriptions'
                : 'https://api.openai.com/v1/audio/transcriptions';
                
            const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;

            const sttResponse = await axios.post(sttUrl, formData, {
                headers: {
                    ...formData.getHeaders(),
                    'Authorization': `Bearer ${apiKey}`
                }
            });
            
            transcript = sttResponse.data.text;
        } catch (sttError: any) {
            console.error("STT Error:", sttError.response?.data || sttError.message);
            return res.status(500).json({ error: 'Failed to transcribe audio.' });
        }
    }

    if (!transcript) return res.status(400).json({ error: 'No transcript or audio provided.' });

    try {
        const systemPrompt = { 
            role: 'system' as const, 
            content: `You are a voice command parser for a media tracking app. Extract the following from the user's spoken command:
            - mediaType: strictly one of "series", "movie", "anime", "anime_movie". (e.g. if they say "anime", it's anime. If they say "show", it's series. If they say "film", it's movie. Best guess if unspecified).
            - mediaName: the name of the show/movie.
            - watched: strictly "True" or "False". If they imply they finished it or watched it all, "True". If they watched up to a point or just want to add it, "False".
            - watchedTill: A string describing their progress (e.g., "Season 2 Episode 4", "Not Watched").
            Return ONLY a valid JSON object with these exactly 4 keys.` 
        };
        const userPrompt = { role: 'user' as const, content: `Command: "${transcript}"` };
        
        const aiResponse = await azureOpenAI.chat.completions.create({ 
            messages: [systemPrompt, userPrompt], 
            model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4o-mini',
            response_format: { type: "json_object" }
        });
        
        const parsed = JSON.parse(aiResponse.choices[0]?.message?.content || '{}');
        
        if (!parsed.mediaName) {
            return res.status(400).json({ error: "Could not understand the media name." });
        }

        const searchPath = parsed.mediaType.includes('movie') ? 'movie' : 'tv';
        const searchUrl = `${TMDB_BASE_URL}/3/search/${searchPath}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(parsed.mediaName)}`;
        const searchResponse = await axios.get(searchUrl);
        const item = searchResponse.data.results[0];
        
        if (!item) {
             return res.status(404).json({ error: `Could not find "${parsed.mediaName}" on TMDB.` });
        }

        res.status(200).json({
            mediaType: parsed.mediaType,
            tmdbId: item.id,
            watched: parsed.watched,
            watchedTill: parsed.watchedTill,
            parsedName: parsed.mediaName,
            officialName: item.title || item.name,
            transcript: transcript // Send back the transcript so the user knows what AI heard
        });
    } catch (error: any) {
        console.error("Voice parse error:", error);
        res.status(500).json({ error: 'Failed to process voice command.' });
    }
});

if (process.env.NODE_ENV !== 'production' || process.env.VERCEL !== '1') {
    app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
}

export default app;