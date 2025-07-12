/* server/index.ts */
import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { google, Auth } from 'googleapis';
import OpenAI from 'openai';
import axios from 'axios';

// Load environment variables from .env file
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Initialize variables correctly
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const PORT = process.env.PORT || 5000;

// Correctly initialize the AI client
const perplexity = new OpenAI({
    apiKey: process.env.PERPLEXITY_API_KEY,
    baseURL: 'https://api.perplexity.ai',
});

const SHEET_CONFIG: { [key: string]: { sheetName: string; range: string; columns: string[] } } = {
    series: {
        sheetName: 'Series',
        range: 'Series!A:I', // Adjusted range
        columns: ['series_name', 'series_status', 'watched_till', 'next_season', 'expected_on', 'update', 'watched', 'release_date']
    },
    movie: {
        sheetName: 'Movies',
        range: 'Movies!A:H', // Adjusted range
        columns: ['movies_name', 'franchise', 'watched_till', 'next_part', 'expected_on', 'update', 'watched', 'release_date']
    },
    anime: {
        sheetName: 'Anime',
        range: 'Anime!A:I', // Adjusted range
        columns: ['anime_name', 'series_status', 'watched_till', 'next_season', 'expected_on', 'update', 'watched', 'release_date']
    },
    anime_movie: {
        sheetName: 'Anime Movies',
        range: 'Anime Movies!A:H', // Adjusted range
        columns: ['movies_name', 'franchise', 'watched_till', 'next_part', 'expected_on', 'update', 'watched', 'release_date']
    }
};

const getSheetsClient = async () => {
    const auth = new google.auth.GoogleAuth({
        keyFile: 'credentials.json',
        scopes: 'https://www.googleapis.com/auth/spreadsheets',
    });
    const client = await auth.getClient();
    return google.sheets({ version: 'v4', auth: client as Auth.OAuth2Client });
};

// --- CHANGE 2: Update AI prompt to ask for franchise NAME ---
const getPromptForMediaType = (mediaType: string, mediaName: string) => {
    const commonSystemMessage = {
        role: 'system' as const,
        content: `You are a media information assistant. Your response MUST strictly be a JSON object with specific keys and formats. Do not include any text, notes, or explanations outside of the final JSON object.`,
    };

    let userMessageContent = `Get details for the ${mediaType}: "${mediaName}". `;
    const commonKeys = `"expected_on" (string, "Month Year" or "Available"), "release_date" (string, the release date in YYYY-MM-DD format).`;

    if (mediaType === 'series' || mediaType === 'anime') {
        userMessageContent += `JSON keys: "series_status" (string, "On Going" or "Completed"), "next_season" (string, "Yes" or "No"), ${commonKeys}`;
    } else { // movie or anime_movie
        userMessageContent += `JSON keys: "franchise" (string, the specific franchise name or "Standalone"), "next_part" (string, "Yes" or "No"), ${commonKeys}`;
    }

    return [
        commonSystemMessage,
        { role: 'user' as const, content: userMessageContent },
    ];
};

// --- CHANGE 3: Simplify transformResponse function ---
const transformResponse = (response: any, watchedTill: string, mediaType: string, watched: string) => {
    const data = { ...response };

    for (const key of ['series_status']) {
        if (typeof data[key] === 'string') {
            const status = data[key].toLowerCase();
            if (status.includes('complete') || status.includes('finish') || status.includes('final') || status.includes('ended')) {
                data[key] = 'Completed';
            } else {
                data[key] = 'On Going';
            }
        }
    }

    if (mediaType === "series" || mediaType === "anime") {
        data.watched_till = watchedTill;
    } else if (mediaType === "movie" || mediaType === "anime_movie") {
        data.watched_till = "Not Watched";
    }

    data.update = new Date().toISOString();
    data.watched = watched; // Add the watched status to the data
    return data;
};

// This function remains the same, with our previous bug fixes included.
const addMediaHandler = async (req: Request, res: Response) => {
    const { mediaType, mediaName, watchedTill, rowIndex, watched } = req.body;

    if (!mediaType || !mediaName || watched === undefined) {
        return res.status(400).json({ error: 'mediaType, mediaName, and watched status are required.' });
    }

    try {
        const sheets = await getSheetsClient();
        const prompt = getPromptForMediaType(mediaType, mediaName);

        const aiResponse = await perplexity.chat.completions.create({
            model: 'sonar-pro',
            messages: prompt,
            stream: false,
        });

        const content = aiResponse.choices[0]?.message?.content;
        if (!content) { throw new Error('No content received from AI.'); }

        const jsonRegex = /```json\s*([\s\S]*?)\s*```|({[\s\S]*})/;
        const match = content.match(jsonRegex);

        if (!match || (!match[1] && !match[2])) {
            console.error('Problematic AI content logged:', content);
            throw new Error('AI did not return a valid JSON code block or object.');
        }

        const jsonString = match[1] || match[2];
        let mediaData;
        try {
            mediaData = JSON.parse(jsonString);
        } catch (e) {
            console.error('Failed to parse JSON from AI response:', e);
            console.error('Problematic AI content logged:', jsonString);
            throw new Error('AI did not return valid JSON. Problematic content logged.');
        }

        const transformedData = transformResponse(mediaData, watchedTill, mediaType, watched);

        if (mediaType === 'series' || mediaType === 'anime') {
            transformedData[`${mediaType}_name`] = mediaName;
        } else if (mediaType === 'movie' || mediaType === 'anime_movie') {
            transformedData['movies_name'] = mediaName;
        }

        const sheetConfig = SHEET_CONFIG[mediaType];
        if (!sheetConfig) { throw new Error(`Invalid mediaType: ${mediaType}`); }

        const values = sheetConfig.columns.map(col => transformedData[col] || '');

        if (rowIndex !== undefined && rowIndex > 0) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${sheetConfig.sheetName}!A${rowIndex}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [values] },
            });
            // FIX: Return the full data object on success
            res.status(200).json({ message: 'Media updated successfully', data: transformedData });
        } else {
            await sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: sheetConfig.range,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [values] },
            });
             // FIX: Return the full data object on success
            res.status(201).json({ message: 'Media added successfully', data: transformedData });
        }
    } catch (error: any) {
        console.error('Error in addMediaHandler:', error);
        res.status(500).json({ error: error.message || 'An internal server error occurred.' });
    }
};

app.get('/get-media/:mediaType', async (req: Request, res: Response) => {
    const { mediaType } = req.params;
    const config = SHEET_CONFIG[mediaType];

    if (!config) {
        return res.status(400).json({ error: 'Invalid media type provided.' });
    }

    try {
        const sheets = await getSheetsClient();
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: config.range,
        });

        const rows = response.data.values;
        if (rows && rows.length > 1) {
            const header = rows[0];
            const data = rows.slice(1).map((row, index) => {
                const rowData: { [key: string]: any } = { row_index: index + 2 }; // +2 because sheets are 1-indexed and we have a header
                header.forEach((key, i) => {
                    rowData[key.toLowerCase().replace(/ /g, '_')] = row[i];
                });
                return rowData;
            });
            res.status(200).json({ data });
        } else {
            res.status(200).json({ data: [] }); // No data found
        }
    } catch (error: any) {
        console.error('Error fetching media list:', error);
        res.status(500).json({ error: 'Failed to fetch data from Google Sheets.' });
    }
});

// Endpoints
app.post('/add-media', addMediaHandler);
app.put('/add-media', addMediaHandler);

// --- CHANGE 4: Add NEW endpoint to get a list of unique franchises ---
app.get('/api/franchises/:mediaType', async (req: Request, res: Response) => {
    const { mediaType } = req.params;
    const config = SHEET_CONFIG[mediaType];

    if (mediaType !== 'movie' && mediaType !== 'anime_movie') {
        return res.status(400).json({ error: 'This endpoint is only for movies and anime movies.' });
    }
    
    try {
        const sheets = await getSheetsClient();
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: config.range,
        });

        const rows = response.data.values;
        if (rows && rows.length > 1) {
            const header = rows[0];
            const franchiseIndex = header.indexOf('Franchise'); // Find the 'Franchise' column
            if (franchiseIndex === -1) {
                return res.status(500).json({ error: "'Franchise' column not found in sheet." });
            }

            const franchises = rows.slice(1).map(row => row[franchiseIndex]);
            
            // Get unique names, filtering out "Standalone" and any empty/falsy values
            const uniqueFranchises = [...new Set(franchises.filter(f => f && f.toLowerCase() !== 'standalone'))];
            
            res.status(200).json({ data: uniqueFranchises });
        } else {
            res.status(200).json({ data: [] });
        }
    } catch (error: any) {
        console.error('Error fetching franchises:', error);
        res.status(500).json({ error: 'Failed to fetch data from Google Sheets.' });
    }
});

// --- CHANGE 5: Add NEW endpoint to get all movies within a specific franchise ---
app.get('/api/franchise/:mediaType/:name', async (req: Request, res: Response) => {
    const { mediaType, name } = req.params;
    const config = SHEET_CONFIG[mediaType];

    if (!config || (mediaType !== 'movie' && mediaType !== 'anime_movie')) {
        return res.status(400).json({ error: 'Invalid media type for franchises.' });
    }

    try {
        const sheets = await getSheetsClient();
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: config.range,
        });

        const rows = response.data.values;
        if (rows && rows.length > 1) {
            const header = rows[0];
            const franchiseIndex = header.indexOf('Franchise');
            if (franchiseIndex === -1) {
                return res.status(500).json({ error: "'Franchise' column not found." });
            }

            const filteredMovies = rows.slice(1).map((row, index) => {
                 // Create a JSON object for each movie
                const rowData: { [key: string]: any } = { row_index: index + 2 };
                header.forEach((key, i) => {
                    rowData[key.toLowerCase().replace(/ /g, '_')] = row[i];
                });
                return rowData;
            }).filter(movie => movie.franchise === name); // Filter by the franchise name

            res.status(200).json({ data: filteredMovies });

        } else {
            res.status(200).json({ data: [] });
        }
    } catch (error: any) {
        console.error(`Error fetching movies for franchise ${name}:`, error);
        res.status(500).json({ error: 'Failed to fetch data from Google Sheets.' });
    }
});

// --- NEW Endpoint to get rich media details from TMDB ---
app.get('/api/details/:mediaType/:name', async (req: Request, res: Response) => {
    const { mediaType, name } = req.params;
    const tmdbApiKey = process.env.TMDB_API_KEY;

    if (!tmdbApiKey) {
        return res.status(500).json({ error: 'TMDB API key is not configured on the server.' });
    }

    // Determine the TMDB search path based on our mediaType
    const searchPath = (mediaType === 'series' || mediaType === 'anime') ? 'tv' : 'movie';

    try {
        // 1. Search for the media to get its TMDB ID
        const searchUrl = `https://api.themoviedb.org/3/search/${searchPath}?api_key=${tmdbApiKey}&query=${encodeURIComponent(name)}`;
        const searchResponse = await axios.get(searchUrl);
        const item = searchResponse.data.results[0];

        if (!item) {
            return res.status(404).json({ error: 'Media not found on TMDB.' });
        }

        // 2. Use the ID to get detailed info, including watch providers
        const detailsUrl = `https://api.themoviedb.org/3/${searchPath}/${item.id}?api_key=${tmdbApiKey}&append_to_response=watch/providers`;
        const detailsResponse = await axios.get(detailsUrl);
        const details = detailsResponse.data;

        // 3. Format the data into a clean object for our frontend
        const formattedData = {
            name: details.name || details.title,
            overview: details.overview,
            poster_path: details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null,
            vote_average: details.vote_average,
            genres: details.genres.map((g: any) => g.name),
            // Get US streaming providers, fallback to others if not available
            providers: details['watch/providers']?.results?.US?.flatrate || details['watch/providers']?.results?.IN?.flatrate || [],
        };

        res.status(200).json({ data: formattedData });

    } catch (error) {
        console.error('Error fetching from TMDB:', error);
        res.status(500).json({ error: 'Failed to fetch details from TMDB.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});