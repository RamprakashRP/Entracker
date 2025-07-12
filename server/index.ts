/* server/index.ts */
import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { google, Auth } from 'googleapis';
import OpenAI from 'openai';
import axios from 'axios';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const PORT = process.env.PORT || 5000;
const TMDB_API_KEY = process.env.TMDB_API_KEY;

const perplexity = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: 'https://api.perplexity.ai',
});

const SHEET_CONFIG: { [key: string]: { sheetName: string; range: string; columns: string[] } } = {
    series: { sheetName: 'Series', range: 'Series!A:I', columns: ['series_name', 'series_status', 'watched_till', 'next_season', 'expected_on', 'update', 'watched', 'release_date'] },
    movie: { sheetName: 'Movies', range: 'Movies!A:H', columns: ['movies_name', 'franchise', 'watched_till', 'next_part', 'expected_on', 'update', 'watched', 'release_date'] },
    anime: { sheetName: 'Anime', range: 'Anime!A:I', columns: ['anime_name', 'series_status', 'watched_till', 'next_season', 'expected_on', 'update', 'watched', 'release_date'] },
    anime_movie: { sheetName: 'Anime Movies', range: 'Anime Movies!A:H', columns: ['movies_name', 'franchise', 'watched_till', 'next_part', 'expected_on', 'update', 'watched', 'release_date'] }
};

const getSheetsClient = async () => {
    const auth = new google.auth.GoogleAuth({ keyFile: 'credentials.json', scopes: 'https://www.googleapis.com/auth/spreadsheets' });
    const client = await auth.getClient();
    return google.sheets({ version: 'v4', auth: client as Auth.OAuth2Client });
};

const getPromptForMediaType = (mediaType: string, mediaName: string) => {
    const commonSystemMessage = { role: 'system' as const, content: `You are a media information assistant. Your response MUST strictly be a JSON object with specific keys and formats.` };
    let userMessageContent = `Get details for the ${mediaType}: "${mediaName}". `;
    const commonKeys = `"expected_on" (string, "Month Year" or "Available"), "release_date" (string, in YYYY-MM-DD format).`;
    if (mediaType.includes('movie')) {
        userMessageContent += `JSON keys: "franchise" (string, the franchise name or "Standalone"), "next_part" (string, "Yes" or "No"), ${commonKeys}`;
    } else {
        userMessageContent += `JSON keys: "series_status" (string, "On Going" or "Completed"), "next_season" (string, "Yes" or "No"), ${commonKeys}`;
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

const addMediaHandler = async (req: Request, res: Response) => {
    const { mediaType, mediaName, watchedTill, watched } = req.body;
    if (!mediaType || !mediaName || watched === undefined) {
        return res.status(400).json({ error: 'mediaType, mediaName, and watched are required.' });
    }

    try {
        const sheets = await getSheetsClient();
        const sheetConfig = SHEET_CONFIG[mediaType];
        if (!sheetConfig) throw new Error(`Invalid mediaType: ${mediaType}`);

        // --- Step 1: Gather ALL data before writing anything ---
        console.log(`[Step 1] Gathering all data for "${mediaName}"...`);
        const allNewRows: string[][] = [];

        const searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(mediaName)}`;
        const searchResponse = await axios.get(searchUrl);
        const tmdbItem = searchResponse.data.results[0];
        
        if (!tmdbItem?.id) {
            return res.status(404).json({ error: `Could not find "${mediaName}" on TMDB. Please check the spelling.` });
        }
        
        const officialName = tmdbItem.title;
        console.log(`... Found official name: "${officialName}"`);

        const prompt = getPromptForMediaType(mediaType, officialName);
        const aiResponse = await perplexity.chat.completions.create({ model: 'sonar-pro', messages: prompt });
        const content = aiResponse.choices[0]?.message?.content;
        if (!content) { throw new Error('No content received from AI.'); }
        const jsonRegex = /```json\s*([\s\S]*?)\s*```|({[\s\S]*})/;
        const match = content.match(jsonRegex);
        if (!match || (!match[1] && !match[2])) { throw new Error('AI did not return valid JSON.'); }
        const jsonString = match[1] || match[2];
        let mediaData = JSON.parse(jsonString);

        const movieDetailsUrl = `https://api.themoviedb.org/3/movie/${tmdbItem.id}?api_key=${TMDB_API_KEY}`;
        const movieDetailsResponse = await axios.get(movieDetailsUrl);
        const collection = movieDetailsResponse.data.belongs_to_collection;

        // **THE FIX IS HERE**: Use .replace() to remove " Collection" from the name
        const franchiseName = collection ? collection.name.replace(/ Collection/i, '').trim() : "Standalone";
        mediaData.franchise = franchiseName;

        const transformedData = transformResponse(mediaData, watchedTill, mediaType, watched);
        transformedData.movies_name = officialName;
        allNewRows.push(sheetConfig.columns.map(col => transformedData[col as keyof typeof transformedData] || ''));

        // --- Step 2: If a franchise was found, gather all other movies ---
        if (collection?.id) {
            console.log(`[Step 2] Found franchise "${franchiseName}". Gathering other movies...`);
            const collectionUrl = `https://api.themoviedb.org/3/collection/${collection.id}?api_key=${TMDB_API_KEY}`;
            const collectionDetails = await axios.get(collectionUrl);
            const franchiseMovies = collectionDetails.data.parts || [];

            const existingMoviesResponse = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: sheetConfig.range });
            const existingMovieNames = new Set(existingMoviesResponse.data.values?.slice(1).map(row => row[0]) || []);
            
            for (const movie of franchiseMovies) {
                if (movie.title && movie.title.toLowerCase() !== officialName.toLowerCase() && !existingMovieNames.has(movie.title)) {
                    const movieRow = {
                        movies_name: movie.title,
                        franchise: franchiseName, // Use the same, consistent franchise name
                        watched_till: 'Not Watched',
                        next_part: 'Yes',
                        expected_on: movie.release_date && new Date(movie.release_date) < new Date() ? 'Available' : 'N/A',
                        update: new Date().toISOString(),
                        watched: 'False',
                        release_date: movie.release_date || 'N/A'
                    };
                    allNewRows.push(sheetConfig.columns.map(col => movieRow[col as keyof typeof movieRow] || ''));
                }
            }
        }

        // --- Step 3: Write everything to the sheet in a single batch ---
        if (allNewRows.length > 0) {
            console.log(`[Step 3] Writing ${allNewRows.length} row(s) to the sheet...`);
            await sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: sheetConfig.range,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: allNewRows },
            });
        }

        res.status(201).json({ message: 'Media and franchise populated successfully!', data: transformedData });

    } catch (error: any) {
        console.error('Error in addMediaHandler:', error);
        res.status(500).json({ error: error.message || 'An internal server error occurred.' });
    }
};

app.post('/add-media', addMediaHandler);

// --- All other GET endpoints remain the same ---
app.get('/get-media/:mediaType', async (req, res) => {
    const { mediaType } = req.params;
    const config = SHEET_CONFIG[mediaType];
    if (!config) { return res.status(400).json({ error: 'Invalid media type.' }); }
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
            res.status(200).json({ data });
        } else {
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
app.get('/api/franchise/:mediaType/:name', async (req, res) => {
    const { mediaType, name } = req.params;
    const config = SHEET_CONFIG[mediaType];
    if (!config || !mediaType.includes('movie')) return res.status(400).json({ error: 'Invalid media type.' });
    try {
        const sheets = await getSheetsClient();
        const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: config.range });
        const rows = response.data.values;
        if (rows && rows.length > 1) {
            const header = rows[0];
            const filteredMovies = rows.slice(1).map((row, index) => {
                const rowData: { [key: string]: any } = { row_index: index + 2 };
                header.forEach((key, i) => { rowData[key.toLowerCase().replace(/ /g, '_')] = row[i]; });
                return rowData;
            }).filter(movie => movie.franchise === name);
            res.status(200).json({ data: filteredMovies });
        } else {
            res.status(200).json({ data: [] });
        }
    } catch (error: any) {
        res.status(500).json({ error: `Failed to fetch movies for ${name}.` });
    }
});
app.get('/api/details/:mediaType/:name', async (req, res) => {
    const { mediaType, name } = req.params;
    if (!TMDB_API_KEY) return res.status(500).json({ error: 'TMDB key not configured.' });
    const searchPath = mediaType.includes('movie') ? 'movie' : 'tv';
    try {
        const searchUrl = `https://api.themoviedb.org/3/search/${searchPath}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(name)}`;
        const searchResponse = await axios.get(searchUrl);
        const item = searchResponse.data.results[0];
        if (!item) return res.status(404).json({ error: 'Media not found on TMDB.' });
        const detailsUrl = `https://api.themoviedb.org/3/${searchPath}/${item.id}?api_key=${TMDB_API_KEY}&append_to_response=watch/providers`;
        const detailsResponse = await axios.get(detailsUrl);
        const details = detailsResponse.data;
        const formattedData = {
            name: details.name || details.title,
            overview: details.overview,
            poster_path: details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null,
            vote_average: details.vote_average,
            genres: details.genres.map((g: any) => g.name),
            providers: details['watch/providers']?.results?.US?.flatrate || details['watch/providers']?.results?.IN?.flatrate || [],
        };
        res.status(200).json({ data: formattedData });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch details from TMDB.' });
    }
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));