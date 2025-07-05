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
// Load environment variables from .env file
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Initialize variables correctly
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const PORT = process.env.PORT || 5000;
// Correctly initialize the AI client
const perplexity = new openai_1.default({
    apiKey: process.env.PERPLEXITY_API_KEY,
    baseURL: 'https://api.perplexity.ai',
});
// --- CHANGE 1: Update SHEET_CONFIG to use 'franchise' column ---
const SHEET_CONFIG = {
    series: {
        sheetName: 'Series',
        range: 'Series!A:H', // Adjusted range for the new column
        columns: ['series_name', 'series_status', 'watched_till', 'next_season', 'expected_on', 'update', 'watched']
    },
    movie: {
        sheetName: 'Movies',
        range: 'Movies!A:G', // Adjusted range for the new column
        columns: ['movies_name', 'franchise', 'watched_till', 'next_part', 'expected_on', 'update', 'watched']
    },
    anime: {
        sheetName: 'Anime',
        range: 'Anime!A:H', // Adjusted range for the new column
        columns: ['anime_name', 'series_status', 'watched_till', 'next_season', 'expected_on', 'update', 'watched']
    },
    anime_movie: {
        sheetName: 'Anime Movies',
        range: 'Anime Movies!A:G', // Adjusted range for the new column
        columns: ['movies_name', 'franchise', 'watched_till', 'next_part', 'expected_on', 'update', 'watched']
    }
};
const getSheetsClient = () => __awaiter(void 0, void 0, void 0, function* () {
    const auth = new googleapis_1.google.auth.GoogleAuth({
        keyFile: 'credentials.json',
        scopes: 'https://www.googleapis.com/auth/spreadsheets',
    });
    const client = yield auth.getClient();
    return googleapis_1.google.sheets({ version: 'v4', auth: client });
});
// --- CHANGE 2: Update AI prompt to ask for franchise NAME ---
const getPromptForMediaType = (mediaType, mediaName) => {
    const commonSystemMessage = {
        role: 'system',
        content: `You are a media information assistant. Your response MUST strictly be a JSON object with specific keys and formats. Do not include any text, notes, or explanations outside of the final JSON object.`,
    };
    let userMessageContent = `Get details for the ${mediaType}: "${mediaName}". `;
    if (mediaType === 'series' || mediaType === 'anime') {
        userMessageContent += `JSON keys: "series_status" (string, "On Going" or "Completed"), "next_season" (string, "Yes" or "No"), "expected_on" (string, "Month Year" or "N/A" or "Available" if it is already released).`;
    }
    else { // movie or anime_movie
        // We now ask the AI to return "Available" if the release date is in the past.
        userMessageContent += `JSON keys: "franchise" (string, the specific name of the franchise like "Harry Potter", or "Standalone" if it is not part of a franchise), "next_part" (string, "Yes" or "No"), "expected_on" (string, "Month Year" if the release date is in the future, or "Available" if it has already been released).`;
    }
    return [
        commonSystemMessage,
        { role: 'user', content: userMessageContent },
    ];
};
// --- CHANGE 3: Simplify transformResponse function ---
const transformResponse = (response, watchedTill, mediaType, watched) => {
    const data = Object.assign({}, response);
    for (const key of ['series_status']) {
        if (typeof data[key] === 'string') {
            const status = data[key].toLowerCase();
            if (status.includes('complete') || status.includes('finish') || status.includes('final') || status.includes('ended')) {
                data[key] = 'Completed';
            }
            else {
                data[key] = 'On Going';
            }
        }
    }
    if (mediaType === "series" || mediaType === "anime") {
        data.watched_till = watchedTill;
    }
    else if (mediaType === "movie" || mediaType === "anime_movie") {
        data.watched_till = "Not Watched";
    }
    data.update = new Date().toISOString();
    data.watched = watched; // Add the watched status to the data
    return data;
};
// This function remains the same, with our previous bug fixes included.
const addMediaHandler = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    // Add 'watched' to the destructured request body
    const { mediaType, mediaName, watchedTill, rowIndex, watched } = req.body;
    if (!mediaType || !mediaName || watched === undefined) {
        return res.status(400).json({ error: 'mediaType, mediaName, and watched status are required.' });
    }
    try {
        const sheets = yield getSheetsClient();
        const prompt = getPromptForMediaType(mediaType, mediaName);
        const aiResponse = yield perplexity.chat.completions.create({
            model: 'sonar-pro',
            messages: prompt,
            stream: false,
        });
        const content = (_b = (_a = aiResponse.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content;
        if (!content) {
            throw new Error('No content received from AI.');
        }
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
        }
        catch (e) {
            console.error('Failed to parse JSON from AI response:', e);
            console.error('Problematic AI content logged:', jsonString);
            throw new Error('AI did not return valid JSON. Problematic content logged.');
        }
        // Pass the 'watched' status to the transform function
        const transformedData = transformResponse(mediaData, watchedTill, mediaType, watched);
        if (mediaType === 'series' || mediaType === 'anime') {
            transformedData[`${mediaType}_name`] = mediaName;
        }
        else if (mediaType === 'movie' || mediaType === 'anime_movie') {
            transformedData['movies_name'] = mediaName;
        }
        const sheetConfig = SHEET_CONFIG[mediaType];
        if (!sheetConfig) {
            throw new Error(`Invalid mediaType: ${mediaType}`);
        }
        const values = sheetConfig.columns.map(col => transformedData[col] || '');
        if (rowIndex !== undefined && rowIndex > 0) {
            yield sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${sheetConfig.sheetName}!A${rowIndex}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [values] },
            });
            res.status(200).json({ message: 'Media updated successfully' });
        }
        else {
            yield sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: sheetConfig.range,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [values] },
            });
            res.status(201).json({ message: 'Media added successfully' });
        }
    }
    catch (error) {
        console.error('Error in addMediaHandler:', error);
        res.status(500).json({ error: error.message || 'An internal server error occurred.' });
    }
});
app.get('/get-media/:mediaType', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { mediaType } = req.params;
    const config = SHEET_CONFIG[mediaType];
    if (!config) {
        return res.status(400).json({ error: 'Invalid media type provided.' });
    }
    try {
        const sheets = yield getSheetsClient();
        const response = yield sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: config.range,
        });
        const rows = response.data.values;
        if (rows && rows.length > 1) {
            const header = rows[0];
            const data = rows.slice(1).map((row, index) => {
                const rowData = { row_index: index + 2 }; // +2 because sheets are 1-indexed and we have a header
                header.forEach((key, i) => {
                    rowData[key.toLowerCase().replace(/ /g, '_')] = row[i];
                });
                return rowData;
            });
            res.status(200).json({ data });
        }
        else {
            res.status(200).json({ data: [] }); // No data found
        }
    }
    catch (error) {
        console.error('Error fetching media list:', error);
        res.status(500).json({ error: 'Failed to fetch data from Google Sheets.' });
    }
}));
// Endpoints
app.post('/add-media', addMediaHandler);
app.put('/add-media', addMediaHandler);
// --- CHANGE 4: Add NEW endpoint to get a list of unique franchises ---
app.get('/api/franchises/:mediaType', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { mediaType } = req.params;
    const config = SHEET_CONFIG[mediaType];
    if (mediaType !== 'movie' && mediaType !== 'anime_movie') {
        return res.status(400).json({ error: 'This endpoint is only for movies and anime movies.' });
    }
    try {
        const sheets = yield getSheetsClient();
        const response = yield sheets.spreadsheets.values.get({
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
        }
        else {
            res.status(200).json({ data: [] });
        }
    }
    catch (error) {
        console.error('Error fetching franchises:', error);
        res.status(500).json({ error: 'Failed to fetch data from Google Sheets.' });
    }
}));
// --- CHANGE 5: Add NEW endpoint to get all movies within a specific franchise ---
app.get('/api/franchise/:mediaType/:name', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { mediaType, name } = req.params;
    const config = SHEET_CONFIG[mediaType];
    if (!config || (mediaType !== 'movie' && mediaType !== 'anime_movie')) {
        return res.status(400).json({ error: 'Invalid media type for franchises.' });
    }
    try {
        const sheets = yield getSheetsClient();
        const response = yield sheets.spreadsheets.values.get({
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
                const rowData = { row_index: index + 2 };
                header.forEach((key, i) => {
                    rowData[key.toLowerCase().replace(/ /g, '_')] = row[i];
                });
                return rowData;
            }).filter(movie => movie.franchise === name); // Filter by the franchise name
            res.status(200).json({ data: filteredMovies });
        }
        else {
            res.status(200).json({ data: [] });
        }
    }
    catch (error) {
        console.error(`Error fetching movies for franchise ${name}:`, error);
        res.status(500).json({ error: 'Failed to fetch data from Google Sheets.' });
    }
}));
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
