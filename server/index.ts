import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import { GoogleAuth } from 'google-auth-library';
import { google } from 'googleapis';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();
const app: Application = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Root route
app.get('/', (req: Request, res: Response) => {
  res.send(`
    <h1>Entracker Backend is Running</h1>
    <p>Welcome to the Entracker API server.</p>
    <ul>
      <li>POST <code>/add-media</code> to add a new entry.</li>
    <li>GET  <code>/get-media/:mediaType</code> to fetch all media of a type.</li>
    <li>PUT  <code>/update-media</code> to update an existing entry.</li>
    </ul>
  `);
});

// Google Sheets setup
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  keyFile: 'credentials.json'
});

// Initialize Google Sheets client
const sheets = google.sheets('v4');

// Perplexity setup
const perplexity = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: 'https://api.perplexity.ai'
});

// Sheet configuration for different media types
const SHEET_CONFIG: Record<string, { range: string; columns: string[] }> = {
  series: {
    range: "Series!A:G",
    columns: ["Series Name", "Series Status", "Season Status", "Watched Till", "Next Season", "Expected On", "Update"]
  },
  movie: {
    range: "Movies!A:F",
    columns: ["Movies Name", "Franchise Status", "Watched Till", "Next Part", "Expected On", "Update"]
  },
  anime: {
    range: "Anime!A:G",
    columns: ["Anime Name", "Series Status", "Season Status", "Watched Till", "Next Season", "Expected On", "Update"]
  },
  anime_movie: {
    range: "Anime Movies!A:F",
    columns: ["Movies Name", "Franchise Status", "Watched Till", "Next Part", "Expected On", "Update"]
  }
};

type OpenAIChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string;
};

// getPromptForMediaType for more precise AI output instructions for Expected On AND Watched Till for movies
function getPromptForMediaType(mediaType: string, mediaName: string): OpenAIChatMessage[] {
  const basePrompt = `Extract details in JSON format. Current date: ${new Date().toISOString().split('T')[0]}. For 'next_season' or 'next_part', explicitly return 'No' if the series/movie is definitively concluded/finished, otherwise 'Yes'.`;
  const expectedOnFormat = `(Format: "Month YYYY" or "N/A" if no announcement, e.g., "September 2025" or "N/A").`;

  switch (mediaType) {
    case 'series':
      return [
        { role: 'system', content: `${basePrompt} with keys: series_status (e.g., 'On Going', 'Completed'), season_status (e.g., 'On Going', 'Completed'), next_season (Yes/No), expected_on ${expectedOnFormat}` },
        { role: 'user', content: `TV series details for "${mediaName}"` }
      ];
    case 'movie':
      return [
        { role: 'system', content: `${basePrompt} with keys: franchise_status (e.g., 'On Going', 'Completed'), next_part (Yes/No), expected_on ${expectedOnFormat}, watched_till (Format: 'Standalone', 'Part X of Y', 'Completed Franchise', 'N/A').` },
        { role: 'user', content: `Movie details for "${mediaName}"` }
      ];
    case 'anime':
      return [
        { role: 'system', content: `${basePrompt} with keys: series_status (e.g., 'On Going', 'Completed'), season_status (e.g., 'On Going', 'Completed'), next_season (Yes/No), expected_on ${expectedOnFormat}` },
        { role: 'user', content: `Anime series details for "${mediaName}"` }
      ];
    case 'anime_movie':
      return [
        { role: 'system', content: `${basePrompt} with keys: franchise_status (e.g., 'On Going', 'Completed'), next_part (Yes/No), expected_on ${expectedOnFormat}, watched_till (Format: 'Standalone', 'Part X of Y', 'Completed Franchise', 'N/A').` },
        { role: 'user', content: `Anime movie details for "${mediaName}"` }
      ];
    default:
      return [];
  }
}

// formatExpectedOn to handle cases where AI might still give verbose answers
function formatExpectedOn(dateStr: string | null): string {
  if (!dateStr || dateStr === 'N/A' || dateStr.toLowerCase().includes('no plans') || dateStr.toLowerCase().includes('no announcements')) {
    return 'N/A';
  }

  // Attempt to extract 'Month YYYY' if a full sentence is provided as a fallback
  const sentenceMonthYearMatch = dateStr.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s(\d{4})/i);
  if (sentenceMonthYearMatch) {
    return `${sentenceMonthYearMatch[1]} ${sentenceMonthYearMatch[2]}`;
  }

  // Try to parse ISO date (e.g., '2025-09-01')
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const date = new Date(dateStr);
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  }

  // Try to match 'Month YYYY' directly
  const monthYearMatch = dateStr.match(/^([A-Za-z]+) (\d{4})$/);
  if (monthYearMatch) {
    return dateStr;
  }
  
  // If the AI gives a short, unparseable string or still a longer descriptive text not captured,
  // default to N/A. The prompt is key, this is a final safeguard.
  if (dateStr.length > 30) { // Reduced from 50 to 30 for stricter filtering
      return 'N/A';
  }

  return dateStr; // Fallback for short, unexpected but potentially valid strings
}


// transformResponse to handle auto-determined watched_till for movies
function transformResponse(
  response: any,
  watchedTill: string, // This watchedTill is from frontend (S01 E01 or empty for movies)
  mediaType: string
): Record<string, string> {
  // Common transformation
  const transformCommon = () => {
    // Series/Season Status
    const statusText = (response.series_status || '').toLowerCase();
    const series_status = statusText.includes('complete') || 
                          statusText.includes('finish') ? 'Completed' : 'On Going';

    // Season Status
    const seasonText = (response.season_status || '').toLowerCase();
    const season_status = seasonText.includes('final') ||
                          seasonText.includes('complete') ||
                          seasonText.includes('ended') ? 'Completed' : 'On Going';

    // Next Season/Part: This logic relies on the prompt telling the AI to return 'No' or 'Yes' directly
    const nextText = (response.next_season || response.next_part || '').toLowerCase();
    const next_value = nextText === 'no' ? 'No' : 'Yes'; // Simplified based on new prompt guidance

    // Expected On - primary formatting happens via AI prompt, this is a fallback for unexpected output
    const expected_on = formatExpectedOn(response.expected_on);

    return {
      series_status,
      season_status,
      next_value,
      expected_on
    };
  };

  // Movie-specific transformation
  const transformMovie = () => {
    const franchiseText = (response.franchise_status || '').toLowerCase();
    const franchise_status = franchiseText.includes('complete') ? 'Completed' : 'On Going';

    const nextPartText = (response.next_part || '').toLowerCase();
    const next_part = nextPartText === 'no' ? 'No' : 'Yes'; // Simplified based on new prompt guidance

    // NEW: Auto-determined watched_till for movies/anime_movies
    let movie_watched_till = (response.watched_till || '').trim();
    if (!movie_watched_till || movie_watched_till.toLowerCase() === 'n/a' || movie_watched_till.length > 50) {
        // If AI gives empty, N/A, or very long text, try to infer from franchise status
        if (franchise_status === 'Completed') {
            movie_watched_till = 'Completed Franchise';
        } else if (next_part === 'No') {
             // If franchise not completed, but no next part, implies standalone or final
            movie_watched_till = 'Standalone/Final Part';
        } else if (movie_watched_till.length === 0) { // If still empty, default to "Watched"
            movie_watched_till = 'Watched'; // Default if no specific info
        }
    }

    return {
      franchise_status,
      next_part,
      expected_on: formatExpectedOn(response.expected_on),
      movie_watched_till // Include the new auto-determined value
    };
  };

  const common = transformCommon();
  const movie = transformMovie();
  const timestamp = new Date().toISOString();

  switch (mediaType) {
    case 'series':
    case 'anime':
      return {
        series_status: common.series_status,
        season_status: common.season_status,
        watched_till: watchedTill, // From frontend (SXX EYY)
        next_season: common.next_value,
        expected_on: common.expected_on,
        update: timestamp
      };
    case 'movie':
    case 'anime_movie':
      return {
        franchise_status: movie.franchise_status,
        watched_till: movie.movie_watched_till, // Use auto-determined value
        next_part: movie.next_part,
        expected_on: movie.expected_on,
        update: timestamp
      };
    default:
      return {};
  }
}

// Handler function for adding or updating media
const addMediaHandler = async (req: Request, res: Response) => {
  const { mediaName, mediaType, watchedTill, rowIndex } = req.body; // NEW: rowIndex included for updates

  if (!SHEET_CONFIG[mediaType]) {
    return res.status(400).json({ error: 'Invalid media type' });
  }

  try {
    const prompt = getPromptForMediaType(mediaType, mediaName);
    if (prompt.length === 0) {
      throw new Error('Invalid media type specified for AI prompt');
    }

    const chatCompletion = await perplexity.chat.completions.create({
      model: 'sonar-pro',
      messages: prompt as any,
    });

    const content = chatCompletion.choices[0].message.content;
    if (!content) {
      throw new Error('No content in AI response');
    }

    console.log("Raw Perplexity content:", content);

    let details;
    try {
        details = JSON.parse(content);
    } catch (parseError) {
        console.error('Failed to parse JSON from AI response:', parseError);
        console.error('Problematic AI content:', content);
        throw new SyntaxError('AI did not return valid JSON. Problematic content logged.');
    }

    const transformed = transformResponse(details, watchedTill, mediaType);

    let row: any[];
    const config = SHEET_CONFIG[mediaType];

    switch (mediaType) {
      case 'series':
      case 'anime':
        row = [
          mediaName,
          transformed.series_status,
          transformed.season_status,
          transformed.watched_till,
          transformed.next_season,
          transformed.expected_on,
          transformed.update
        ];
        break;
      case 'movie':
      case 'anime_movie':
        row = [
          mediaName,
          transformed.franchise_status,
          transformed.watched_till,
          transformed.next_part,
          transformed.expected_on,
          transformed.update
        ];
        break;
      default:
        throw new Error('Unhandled media type for row construction');
    }

    if (rowIndex) { // If rowIndex is provided, it's an update operation
      console.log(`Attempting to update row ${rowIndex} in Google Sheet:`, row);
      await sheets.spreadsheets.values.update({
        auth,
        spreadsheetId: process.env.SPREADSHEET_ID as string,
        range: `${config.range.split('!')[0]}!A${rowIndex}`, // e.g., "Series!A10"
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [row] }
      });
      console.log(`Google Sheet update successful for row ${rowIndex}.`);
    } else { // Otherwise, it's an append operation
      console.log("Attempting to append row to Google Sheet:", row);
      await sheets.spreadsheets.values.append({
        auth,
        spreadsheetId: process.env.SPREADSHEET_ID as string,
        range: config.range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [row] }
      });
      console.log("Google Sheet append successful.");
    }
    
    res.json({ success: true, data: transformed });

  } catch (error: any) {
    console.error('Error in addMediaHandler:', error);

    if (error.response && error.response.data) {
        console.error('Error response data (e.g., from Google API or Perplexity):', error.response.data);
    } else if (error.message) {
        console.error('Error message:', error.message);
    }
    
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
      return res.status(500).json({ error: 'Failed to parse AI response. It might not be valid JSON. Please try again or provide a different media name.' });
    } else if (error.message.includes('No content in AI response')) {
      return res.status(500).json({ error: 'AI could not retrieve content for the media. Try a different name or media type.' });
    } else if (error.code === 401 || error.code === 403 || (error.response && error.response.status === 403)) {
        return res.status(500).json({ error: 'Google Sheets API permission denied. Check credentials.json and service account access to spreadsheet. Details in backend logs.' });
    } else if (error.message.includes('spreadsheetId') || error.message.includes('range')) {
        return res.status(500).json({ error: 'Google Sheets configuration error (ID or Range). Check backend logs.' });
    }
    res.status(500).json({ error: 'An unexpected internal server error occurred. Check backend logs for details.' });
  }
};

// NEW: GET endpoint to fetch all media data for a given type
app.get('/get-media/:mediaType', async (req: Request, res: Response) => {
  const { mediaType } = req.params;

  if (!SHEET_CONFIG[mediaType]) {
    return res.status(400).json({ error: 'Invalid media type' });
  }

  const config = SHEET_CONFIG[mediaType];
  try {
    const response = await sheets.spreadsheets.values.get({
      auth,
      spreadsheetId: process.env.SPREADSHEET_ID as string,
      range: config.range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Assuming first row is headers
    const headers = rows[0];
    const mediaData = rows.slice(1).map((row, index) => {
      let item: { [key: string]: any } = {};
      // Create an object with header names as keys
      headers.forEach((header: string, colIndex: number) => {
        item[header.replace(/\s/g, '_').toLowerCase()] = row[colIndex];
      });
      item.row_index = index + 2; // +2 because sheet is 1-indexed and we skipped header row
      return item;
    });

    res.json({ success: true, data: mediaData });

  } catch (error: any) {
    console.error(`Error fetching media list for ${mediaType}:`, error);
    res.status(500).json({ error: 'Failed to fetch media list. Check backend logs.' });
  }
});

// Route registration for POST (Add)
app.post('/add-media', (req: Request, res: Response) => {
  addMediaHandler(req, res).catch(error => {
    console.error('Unhandled error caught by outer POST route handler:', error);
    res.status(500).json({ error: 'Internal server error' });
  });
});

// NEW: Route registration for PUT (Update)
app.put('/update-media', (req: Request, res: Response) => {
    addMediaHandler(req, res).catch(error => {
        console.error('Unhandled error caught by outer PUT route handler:', error);
        res.status(500).json({ error: 'Internal server error' });
    });
});


app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

// Export app for testing
export default app;