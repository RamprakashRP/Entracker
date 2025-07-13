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

const perplexity = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: 'https://api.perplexity.ai' });

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
        userMessageContent += `JSON keys: "next_part" (string, "Yes" or "No").`;
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

// --- API Endpoints ---

app.post('/add-media', async (req: Request, res: Response) => {
    const { mediaType, tmdbId, watched, watchedTill } = req.body;
    if (!mediaType || !tmdbId || watched === undefined) {
        return res.status(400).json({ error: 'mediaType, tmdbId, and watched are required.' });
    }

    try {
        const sheets = await getSheetsClient();
        const sheetConfig = SHEET_CONFIG[mediaType];
        if (!sheetConfig) throw new Error(`Invalid mediaType: ${mediaType}`);

        const searchPath = mediaType.includes('movie') ? 'movie' : 'tv';
        const detailsUrl = `https://api.themoviedb.org/3/${searchPath}/${tmdbId}?api_key=${TMDB_API_KEY}`;
        const detailsResponse = await axios.get(detailsUrl);
        const tmdbDetails = detailsResponse.data;
        const officialName = tmdbDetails.title || tmdbDetails.name;
        
        const existingMoviesResponse = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: sheetConfig.range });
        const existingMovieNames = new Set(existingMoviesResponse.data.values?.slice(1).map(row => row[0].toLowerCase()) || []);
        if (existingMovieNames.has(officialName.toLowerCase())) {
            return res.status(409).json({ error: `"${officialName}" is already in your list.` });
        }
        
        const prompt = getPromptForMediaType(mediaType, officialName);
        const aiResponse = await perplexity.chat.completions.create({ model: 'sonar-pro', messages: prompt });
        const content = aiResponse.choices[0]?.message?.content || '{}';
        const mediaData = JSON.parse(content.match(/({[\s\S]*})/)?.[1] || '{}');

        const collection = tmdbDetails.belongs_to_collection;
        mediaData.franchise = collection ? collection.name.replace(/ Collection/i, '').trim() : "Standalone";
        mediaData.release_date = tmdbDetails.release_date || tmdbDetails.first_air_date;

        const transformedData = transformResponse(mediaData, watchedTill, mediaType, watched);
        const nameKey = mediaType.includes('movie') ? 'movies_name' : `${mediaType}_name`;
        transformedData[nameKey] = officialName;
        
        const newPrimaryRow = [sheetConfig.columns.map(col => transformedData[col as keyof typeof transformedData] || '')];

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID, range: sheetConfig.range, valueInputOption: 'USER_ENTERED',
            requestBody: { values: newPrimaryRow },
        });
        
        res.status(201).json({ message: 'Media added successfully!', data: transformedData });

        if (collection?.id) {
            (async () => {
                try {
                    console.log(`[BACKGROUND] Starting franchise population for "${collection.name}"`);
                    const collectionUrl = `https://api.themoviedb.org/3/collection/${collection.id}?api_key=${TMDB_API_KEY}`;
                    const collectionDetails = await axios.get(collectionUrl);
                    const franchiseMovies = collectionDetails.data.parts || [];
                    
                    const freshExistingNames = new Set(existingMovieNames).add(officialName.toLowerCase());
                    const newRowsToAdd: string[][] = [];

                    for (const movie of franchiseMovies) {
                        if (movie.title && movie.id !== tmdbId && !freshExistingNames.has(movie.title.toLowerCase())) {
                            const movieRow = {
                                movies_name: movie.title,
                                franchise: mediaData.franchise,
                                watched_till: 'Not Watched',
                                next_part: 'Yes',
                                expected_on: movie.release_date && new Date(movie.release_date) < new Date() ? 'Available' : 'N/A',
                                update: new Date().toISOString(),
                                watched: 'False',
                                release_date: movie.release_date || 'N/A'
                            };
                            newRowsToAdd.push(sheetConfig.columns.map(col => movieRow[col as keyof typeof movieRow] || ''));
                        }
                    }

                    if (newRowsToAdd.length > 0) {
                        console.log(`[BACKGROUND] Adding ${newRowsToAdd.length} new movies from "${mediaData.franchise}".`);
                        await sheets.spreadsheets.values.append({
                            spreadsheetId: SPREADSHEET_ID, range: sheetConfig.range, valueInputOption: 'USER_ENTERED',
                            requestBody: { values: newRowsToAdd },
                        });
                    }
                    console.log(`[BACKGROUND] Franchise task finished for "${mediaData.franchise}".`);
                } catch (error) { console.error('[BACKGROUND TASK ERROR]', error); }
            })();
        }
    } catch (error: any) {
        console.error("Add/Update Error:", error);
        res.status(500).json({ error: error.message || 'An error occurred.' });
    }
});

app.put('/update-media', async (req: Request, res: Response) => {
    const { rowIndex, mediaType, name, watched, watchedTill } = req.body;
    if (!rowIndex || !mediaType) { return res.status(400).json({ error: 'rowIndex and mediaType are required.' }); }

    try {
        const sheets = await getSheetsClient();
        const sheetConfig = SHEET_CONFIG[mediaType];
        if (!sheetConfig) throw new Error(`Invalid mediaType: ${mediaType}`);

        const updates = [];
        const nameColLetter = String.fromCharCode('A'.charCodeAt(0) + sheetConfig.columns.indexOf(sheetConfig.columns[0]));
        const watchedColLetter = String.fromCharCode('A'.charCodeAt(0) + sheetConfig.columns.indexOf('watched'));
        const watchedTillColLetter = String.fromCharCode('A'.charCodeAt(0) + sheetConfig.columns.indexOf('watched_till'));

        if (name) {
            updates.push(sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID, range: `${sheetConfig.sheetName}!${nameColLetter}${rowIndex}`,
                valueInputOption: 'USER_ENTERED', requestBody: { values: [[name]] }
            }));
        }
        if (watched) {
             updates.push(sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID, range: `${sheetConfig.sheetName}!${watchedColLetter}${rowIndex}`,
                valueInputOption: 'USER_ENTERED', requestBody: { values: [[watched]] }
            }));
             if(mediaType.includes('movie')) {
                 updates.push(sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID, range: `${sheetConfig.sheetName}!${watchedTillColLetter}${rowIndex}`,
                    valueInputOption: 'USER_ENTERED', requestBody: { values: [[watched === 'True' ? 'Watched' : 'Not Watched']] }
                }));
             }
        }
        if (watchedTill && (mediaType === 'series' || mediaType === 'anime')) {
            updates.push(sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID, range: `${sheetConfig.sheetName}!${watchedTillColLetter}${rowIndex}`,
                valueInputOption: 'USER_ENTERED', requestBody: { values: [[watchedTill]] }
            }));
        }

        await Promise.all(updates);
        res.status(200).json({ message: 'Update successful!' });
    } catch (error: any) {
        console.error("Update Error:", error);
        res.status(500).json({ error: 'Failed to update entry.' });
    }
});

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
    } catch (error: any) { res.status(500).json({ error: 'Failed to fetch data.' }); }
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
    } catch (error: any) { res.status(500).json({ error: 'Failed to fetch franchises.' }); }
});

app.get('/api/franchise/:mediaType/:name', async (req, res) => {
    const { mediaType, name } = req.params;
    const config = SHEET_CONFIG[mediaType];
    if (!config || !mediaType.includes('movie')) { return res.status(400).json({ error: 'Invalid media type for franchises.' }); }
    try {
        const sheets = await getSheetsClient();
        const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: config.range });
        const rows = response.data.values;
        if (!rows || rows.length <= 1) { return res.status(404).json({ error: 'No movies found for this franchise in the sheet.' }); }
        const header = rows[0];
        const franchiseMoviesInSheet = rows.slice(1).map((row, index) => {
            const rowData: { [key: string]: any } = { row_index: index + 2 };
            header.forEach((key, i) => { rowData[key.toLowerCase().replace(/ /g, '_')] = row[i]; });
            return rowData;
        }).filter(movie => movie.franchise === name);
        if (franchiseMoviesInSheet.length === 0) { return res.status(404).json({ error: 'No movies found for this franchise in the sheet.' }); }

        const searchUrl = `https://api.themoviedb.org/3/search/collection?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(name)}`;
        const searchResponse = await axios.get(searchUrl);
        const collection = searchResponse.data.results[0];
        let collectionDetails = {};
        if (collection?.id) {
            const collectionUrl = `https://api.themoviedb.org/3/collection/${collection.id}?api_key=${TMDB_API_KEY}`;
            const detailsResponse = await axios.get(collectionUrl);
            collectionDetails = {
                overview: detailsResponse.data.overview,
                poster_path: detailsResponse.data.poster_path ? `https://image.tmdb.org/t/p/w500${detailsResponse.data.poster_path}` : null,
                name: detailsResponse.data.name
            };
        }
        res.status(200).json({ details: collectionDetails, movies: franchiseMoviesInSheet });
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
        const searchUrl = `https://api.themoviedb.org/3/search/${searchPath}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(name)}`;
        const searchResponse = await axios.get(searchUrl);
        const item = searchResponse.data.results[0];
        if (!item) return res.status(404).json({ error: 'Media not found on TMDB.' });
        const detailsUrl = `https://api.themoviedb.org/3/${searchPath}/${item.id}?api_key=${TMDB_API_KEY}&append_to_response=watch/providers`;
        const detailsResponse = await axios.get(detailsUrl);
        const details = detailsResponse.data;
        const formattedData = {
            name: details.name || details.title, overview: details.overview,
            poster_path: details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null,
            vote_average: details.vote_average, genres: details.genres.map((g: any) => g.name),
            providers: details['watch/providers']?.results?.US?.flatrate || details['watch/providers']?.results?.IN?.flatrate || [],
        };
        res.status(200).json({ data: formattedData });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch details from TMDB.' });
    }
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));