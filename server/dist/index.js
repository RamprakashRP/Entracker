"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* server/index.ts */
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const googleapis_1 = require("googleapis");
const openai_1 = __importDefault(require("openai"));
const axios_1 = __importDefault(require("axios"));
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const PORT = process.env.PORT || 5000;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const perplexity = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY, baseURL: 'https://api.perplexity.ai' });
const SHEET_CONFIG = {
    series: { sheetName: 'Series', range: 'Series!A:I', columns: ['series_name', 'series_status', 'watched_till', 'next_season', 'expected_on', 'update', 'watched', 'release_date'] },
    movie: { sheetName: 'Movies', range: 'Movies!A:H', columns: ['movies_name', 'franchise', 'watched_till', 'next_part', 'expected_on', 'update', 'watched', 'release_date'] },
    anime: { sheetName: 'Anime', range: 'Anime!A:I', columns: ['anime_name', 'series_status', 'watched_till', 'next_season', 'expected_on', 'update', 'watched', 'release_date'] },
    anime_movie: { sheetName: 'Anime Movies', range: 'Anime Movies!A:H', columns: ['movies_name', 'franchise', 'watched_till', 'next_part', 'expected_on', 'update', 'watched', 'release_date'] }
};
const getSheetsClient = () => __awaiter(void 0, void 0, void 0, function* () {
    const auth = new googleapis_1.google.auth.GoogleAuth({ keyFile: 'credentials.json', scopes: 'https://www.googleapis.com/auth/spreadsheets' });
    const client = yield auth.getClient();
    return googleapis_1.google.sheets({ version: 'v4', auth: client });
});
const getPromptForMediaType = (mediaType, mediaName) => {
    const commonSystemMessage = { role: 'system', content: `You are a media information assistant. Your response MUST strictly be a JSON object with specific keys and formats.` };
    let userMessageContent = `Get details for the ${mediaType}: "${mediaName}". `;
    const commonKeys = `"expected_on" (string, "Month Year" or "Available"), "release_date" (string, in YYYY-MM-DD format).`;
    if (mediaType.includes('movie')) {
        userMessageContent += `JSON keys: "next_part" (string, "Yes" or "No").`;
    }
    else {
        userMessageContent += `JSON keys: "series_status" (string, "On Going" or "Completed"), "next_season" (string, "Yes" or "No"), ${commonKeys}`;
    }
    return [commonSystemMessage, { role: 'user', content: userMessageContent }];
};
const transformResponse = (response, watchedTill, mediaType, watched) => {
    const data = Object.assign({}, response);
    if (typeof data.series_status === 'string')
        data.series_status = (data.series_status.toLowerCase().includes('complete')) ? 'Completed' : 'On Going';
    data.watched_till = mediaType.includes('movie') ? (watched === 'True' ? 'Watched' : 'Not Watched') : watchedTill;
    data.update = new Date().toISOString();
    data.watched = watched;
    return data;
};
// --- API Endpoints ---
app.post('/add-media', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const { mediaType, tmdbId, watched, watchedTill } = req.body;
    if (!mediaType || !tmdbId || watched === undefined) {
        return res.status(400).json({ error: 'mediaType, tmdbId, and watched are required.' });
    }
    try {
        const sheets = yield getSheetsClient();
        const sheetConfig = SHEET_CONFIG[mediaType];
        if (!sheetConfig)
            throw new Error(`Invalid mediaType: ${mediaType}`);
        const searchPath = mediaType.includes('movie') ? 'movie' : 'tv';
        const detailsUrl = `https://api.themoviedb.org/3/${searchPath}/${tmdbId}?api_key=${TMDB_API_KEY}`;
        const detailsResponse = yield axios_1.default.get(detailsUrl);
        const tmdbDetails = detailsResponse.data;
        const officialName = tmdbDetails.title || tmdbDetails.name;
        const existingMoviesResponse = yield sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: sheetConfig.range });
        const existingMovieNames = new Set(((_a = existingMoviesResponse.data.values) === null || _a === void 0 ? void 0 : _a.slice(1).map(row => row[0].toLowerCase())) || []);
        if (existingMovieNames.has(officialName.toLowerCase())) {
            return res.status(409).json({ error: `"${officialName}" is already in your list.` });
        }
        const prompt = getPromptForMediaType(mediaType, officialName);
        const aiResponse = yield perplexity.chat.completions.create({ model: 'sonar-pro', messages: prompt });
        const content = ((_c = (_b = aiResponse.choices[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || '{}';
        const mediaData = JSON.parse(((_d = content.match(/({[\s\S]*})/)) === null || _d === void 0 ? void 0 : _d[1]) || '{}');
        const collection = tmdbDetails.belongs_to_collection;
        mediaData.franchise = collection ? collection.name.replace(/ Collection/i, '').trim() : "Standalone";
        mediaData.release_date = tmdbDetails.release_date || tmdbDetails.first_air_date;
        const transformedData = transformResponse(mediaData, watchedTill, mediaType, watched);
        const nameKey = mediaType.includes('movie') ? 'movies_name' : `${mediaType}_name`;
        transformedData[nameKey] = officialName;
        const newPrimaryRow = [sheetConfig.columns.map(col => transformedData[col] || '')];
        yield sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID, range: sheetConfig.range, valueInputOption: 'USER_ENTERED',
            requestBody: { values: newPrimaryRow },
        });
        res.status(201).json({ message: 'Media added successfully!', data: transformedData });
        if (collection === null || collection === void 0 ? void 0 : collection.id) {
            (() => __awaiter(void 0, void 0, void 0, function* () {
                try {
                    console.log(`[BACKGROUND] Starting franchise population for "${collection.name}"`);
                    const collectionUrl = `https://api.themoviedb.org/3/collection/${collection.id}?api_key=${TMDB_API_KEY}`;
                    const collectionDetails = yield axios_1.default.get(collectionUrl);
                    const franchiseMovies = collectionDetails.data.parts || [];
                    const freshExistingNames = new Set(existingMovieNames).add(officialName.toLowerCase());
                    const newRowsToAdd = [];
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
                            newRowsToAdd.push(sheetConfig.columns.map(col => movieRow[col] || ''));
                        }
                    }
                    if (newRowsToAdd.length > 0) {
                        console.log(`[BACKGROUND] Adding ${newRowsToAdd.length} new movies from "${mediaData.franchise}".`);
                        yield sheets.spreadsheets.values.append({
                            spreadsheetId: SPREADSHEET_ID, range: sheetConfig.range, valueInputOption: 'USER_ENTERED',
                            requestBody: { values: newRowsToAdd },
                        });
                    }
                    console.log(`[BACKGROUND] Franchise task finished for "${mediaData.franchise}".`);
                }
                catch (error) {
                    console.error('[BACKGROUND TASK ERROR]', error);
                }
            }))();
        }
    }
    catch (error) {
        console.error("Add/Update Error:", error);
        res.status(500).json({ error: error.message || 'An error occurred.' });
    }
}));
app.put('/update-media', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { rowIndex, mediaType, name, watched, watchedTill } = req.body;
    if (!rowIndex || !mediaType) {
        return res.status(400).json({ error: 'rowIndex and mediaType are required.' });
    }
    try {
        const sheets = yield getSheetsClient();
        const sheetConfig = SHEET_CONFIG[mediaType];
        if (!sheetConfig)
            throw new Error(`Invalid mediaType: ${mediaType}`);
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
            if (mediaType.includes('movie')) {
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
        yield Promise.all(updates);
        res.status(200).json({ message: 'Update successful!' });
    }
    catch (error) {
        console.error("Update Error:", error);
        res.status(500).json({ error: 'Failed to update entry.' });
    }
}));
app.get('/get-media/:mediaType', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { mediaType } = req.params;
    const config = SHEET_CONFIG[mediaType];
    if (!config) {
        return res.status(400).json({ error: 'Invalid media type.' });
    }
    try {
        const sheets = yield getSheetsClient();
        const response = yield sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: config.range });
        const rows = response.data.values;
        if (rows && rows.length > 1) {
            const header = rows[0];
            const data = rows.slice(1).map((row, index) => {
                const rowData = { row_index: index + 2 };
                header.forEach((key, i) => { rowData[key.toLowerCase().replace(/ /g, '_')] = row[i]; });
                return rowData;
            });
            res.status(200).json({ data });
        }
        else {
            res.status(200).json({ data: [] });
        }
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch data.' });
    }
}));
app.get('/api/franchises/:mediaType', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { mediaType } = req.params;
    const config = SHEET_CONFIG[mediaType];
    if (!mediaType.includes('movie'))
        return res.status(400).json({ error: 'Endpoint only for movies.' });
    try {
        const sheets = yield getSheetsClient();
        const response = yield sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: config.range });
        const rows = response.data.values;
        if (rows && rows.length > 1) {
            const header = rows[0];
            const franchiseIndex = header.indexOf('Franchise');
            if (franchiseIndex === -1)
                return res.status(500).json({ error: "'Franchise' column not found." });
            const franchises = rows.slice(1).map(row => row[franchiseIndex]);
            const uniqueFranchises = [...new Set(franchises.filter(f => f && f.toLowerCase() !== 'standalone'))];
            res.status(200).json({ data: uniqueFranchises });
        }
        else {
            res.status(200).json({ data: [] });
        }
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch franchises.' });
    }
}));
app.get('/api/franchise/:mediaType/:name', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { mediaType, name } = req.params;
    const config = SHEET_CONFIG[mediaType];
    if (!config || !mediaType.includes('movie')) {
        return res.status(400).json({ error: 'Invalid media type for franchises.' });
    }
    try {
        const sheets = yield getSheetsClient();
        const response = yield sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: config.range });
        const rows = response.data.values;
        if (!rows || rows.length <= 1) {
            return res.status(404).json({ error: 'No movies found for this franchise in the sheet.' });
        }
        const header = rows[0];
        const franchiseMoviesInSheet = rows.slice(1).map((row, index) => {
            const rowData = { row_index: index + 2 };
            header.forEach((key, i) => { rowData[key.toLowerCase().replace(/ /g, '_')] = row[i]; });
            return rowData;
        }).filter(movie => movie.franchise === name);
        if (franchiseMoviesInSheet.length === 0) {
            return res.status(404).json({ error: 'No movies found for this franchise in the sheet.' });
        }
        const searchUrl = `https://api.themoviedb.org/3/search/collection?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(name)}`;
        const searchResponse = yield axios_1.default.get(searchUrl);
        const collection = searchResponse.data.results[0];
        let collectionDetails = {};
        if (collection === null || collection === void 0 ? void 0 : collection.id) {
            const collectionUrl = `https://api.themoviedb.org/3/collection/${collection.id}?api_key=${TMDB_API_KEY}`;
            const detailsResponse = yield axios_1.default.get(collectionUrl);
            collectionDetails = {
                overview: detailsResponse.data.overview,
                poster_path: detailsResponse.data.poster_path ? `https://image.tmdb.org/t/p/w500${detailsResponse.data.poster_path}` : null,
                name: detailsResponse.data.name
            };
        }
        res.status(200).json({ details: collectionDetails, movies: franchiseMoviesInSheet });
    }
    catch (error) {
        console.error(`Error fetching movies for franchise ${name}:`, error);
        res.status(500).json({ error: 'Failed to fetch data from Google Sheets or TMDB.' });
    }
}));
app.get('/api/details/:mediaType/:name', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f;
    const { mediaType, name } = req.params;
    if (!TMDB_API_KEY)
        return res.status(500).json({ error: 'TMDB key not configured.' });
    const searchPath = mediaType.includes('movie') ? 'movie' : 'tv';
    try {
        const searchUrl = `https://api.themoviedb.org/3/search/${searchPath}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(name)}`;
        const searchResponse = yield axios_1.default.get(searchUrl);
        const item = searchResponse.data.results[0];
        if (!item)
            return res.status(404).json({ error: 'Media not found on TMDB.' });
        const detailsUrl = `https://api.themoviedb.org/3/${searchPath}/${item.id}?api_key=${TMDB_API_KEY}&append_to_response=watch/providers`;
        const detailsResponse = yield axios_1.default.get(detailsUrl);
        const details = detailsResponse.data;
        const formattedData = {
            name: details.name || details.title, overview: details.overview,
            poster_path: details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null,
            vote_average: details.vote_average, genres: details.genres.map((g) => g.name),
            providers: ((_c = (_b = (_a = details['watch/providers']) === null || _a === void 0 ? void 0 : _a.results) === null || _b === void 0 ? void 0 : _b.US) === null || _c === void 0 ? void 0 : _c.flatrate) || ((_f = (_e = (_d = details['watch/providers']) === null || _d === void 0 ? void 0 : _d.results) === null || _e === void 0 ? void 0 : _e.IN) === null || _f === void 0 ? void 0 : _f.flatrate) || [],
        };
        res.status(200).json({ data: formattedData });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch details from TMDB.' });
    }
}));
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
