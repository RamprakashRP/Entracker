/* server/index.ts */
import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import { GoogleAuth } from 'google-auth-library';
import { google } from 'googleapis';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

dotenv.config();

console.log("Loaded Perplexity API Key:", process.env.PERPLEXITY_API_KEY ? "Found" : "Not Found!");

const app: Application = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

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

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  keyFile: 'credentials.json'
});

const sheets = google.sheets('v4');

const perplexity = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: 'https://api.perplexity.ai'
});

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

// ⭐ FIX: Made the prompt much stricter to force JSON output
function getPromptForMediaType(mediaType: string, mediaName: string): ChatCompletionMessageParam[] {
  const basePrompt = `You are a data extraction API. Your ONLY response must be a single, minified JSON object. Do not include markdown, explanations, or any text outside of the JSON. Current date: ${new Date().toISOString().split('T')[0]}.`;
  const expectedOnFormat = `Format as "Month YYYY" or "N/A".`;

  switch (mediaType) {
    case 'series':
    case 'anime':
      return [
        { role: 'system', content: `${basePrompt} The JSON object must have these keys: "series_status" (string, 'Ongoing' or 'Completed'), "season_status" (string, 'Ongoing' or 'Completed'), "next_season" (string, 'Yes' or 'No'), "expected_on" (string, ${expectedOnFormat}).` },
        { role: 'user', content: `Details for TV/Anime series: "${mediaName}"` }
      ];
    case 'movie':
    case 'anime_movie':
      return [
        { role: 'system', content: `${basePrompt} The JSON object must have these keys: "franchise_status" (string, 'Ongoing' or 'Completed'), "next_part" (string, 'Yes' or 'No'), "expected_on" (string, ${expectedOnFormat}), "watched_till" (string, 'Standalone', 'Part X of Y', or 'Completed Franchise').` },
        { role: 'user', content: `Details for movie: "${mediaName}"` }
      ];
    default:
      return [];
  }
}

function formatExpectedOn(dateStr: string | null): string {
  if (!dateStr || dateStr.toLowerCase() === 'n/a' || dateStr.toLowerCase().includes('no')) {
    return 'N/A';
  }
  return dateStr;
}

function transformResponse(response: any, watchedTill: string, mediaType: string): Record<string, string> {
  const common = {
    series_status: response.series_status || 'Ongoing',
    season_status: response.season_status || 'Ongoing',
    next_season: response.next_season || 'Yes',
    expected_on: formatExpectedOn(response.expected_on),
  };

  const movie = {
    franchise_status: response.franchise_status || 'Ongoing',
    next_part: response.next_part || 'Yes',
    expected_on: formatExpectedOn(response.expected_on),
    movie_watched_till: response.watched_till || 'Watched',
  };

  const timestamp = new Date().toISOString();

  switch (mediaType) {
    case 'series':
    case 'anime':
      return {
        series_status: common.series_status,
        season_status: common.season_status,
        watched_till: watchedTill,
        next_season: common.next_season,
        expected_on: common.expected_on,
        update: timestamp
      };
    case 'movie':
    case 'anime_movie':
      return {
        franchise_status: movie.franchise_status,
        watched_till: movie.movie_watched_till,
        next_part: movie.next_part,
        expected_on: movie.expected_on,
        update: timestamp
      };
    default:
      return {};
  }
}

const addMediaHandler = async (req: Request, res: Response) => {
  const { mediaName, mediaType, watchedTill, rowIndex } = req.body;

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
      messages: prompt,
      // ⭐ FIX: Removed the invalid `response_format` parameter
    });

    const content = chatCompletion.choices[0].message.content;
    if (!content) {
      throw new Error('No content in AI response');
    }

    console.log("Raw Perplexity content:", content);

    let details;
    try {
        // ⭐ FIX: Add a helper to extract JSON from a potentially messy string
        const jsonString = content.substring(content.indexOf('{'), content.lastIndexOf('}') + 1);
        details = JSON.parse(jsonString);
    } catch (parseError) {
        console.error('Failed to parse JSON from AI response:', parseError);
        console.error('Problematic AI content:', content);
        throw new SyntaxError('AI did not return valid JSON. Please try again or provide a different media name.');
    }

    const transformed = transformResponse(details, watchedTill, mediaType);

    let row: any[];
    const config = SHEET_CONFIG[mediaType];

    switch (mediaType) {
      case 'series':
      case 'anime':
        row = [mediaName, transformed.series_status, transformed.season_status, transformed.watched_till, transformed.next_season, transformed.expected_on, transformed.update];
        break;
      case 'movie':
      case 'anime_movie':
        row = [mediaName, transformed.franchise_status, transformed.watched_till, transformed.next_part, transformed.expected_on, transformed.update];
        break;
      default:
        throw new Error('Unhandled media type for row construction');
    }

    if (rowIndex) {
      await sheets.spreadsheets.values.update({
        auth,
        spreadsheetId: process.env.SPREADSHEET_ID as string,
        range: `${config.range.split('!')[0]}!A${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [row] }
      });
    } else {
      await sheets.spreadsheets.values.append({
        auth,
        spreadsheetId: process.env.SPREADSHEET_ID as string,
        range: config.range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [row] }
      });
    }
    
    // ⭐ FIX: Return the transformed data so the frontend can display it
    res.json({ success: true, data: transformed });

  } catch (error: any) {
    console.error('Error in addMediaHandler:', error);
    if (error.response?.data) console.error('Error response data:', error.response.data);
    if (error instanceof SyntaxError) {
      return res.status(500).json({ error: 'Failed to parse AI response. It might not be valid JSON. Please try again or provide a different media name.' });
    }
    res.status(500).json({ error: 'An unexpected internal server error occurred.' });
  }
};

app.get('/get-media/:mediaType', async (req: Request, res: Response) => {
  const { mediaType } = req.params;
  if (!SHEET_CONFIG[mediaType]) {
    return res.status(400).json({ error: 'Invalid media type' });
  }
  try {
    const response = await sheets.spreadsheets.values.get({
      auth,
      spreadsheetId: process.env.SPREADSHEET_ID as string,
      range: SHEET_CONFIG[mediaType].range,
    });
    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return res.json({ success: true, data: [] });
    }
    const headers = rows[0];
    const mediaData = rows.slice(1).map((row, index) => {
      let item: { [key: string]: any } = {};
      headers.forEach((header: string, colIndex: number) => {
        item[header.replace(/\s/g, '_').toLowerCase()] = row[colIndex];
      });
      item.row_index = index + 2;
      return item;
    });
    res.json({ success: true, data: mediaData });
  } catch (error: any) {
    console.error(`Error fetching media list for ${mediaType}:`, error);
    res.status(500).json({ error: 'Failed to fetch media list.' });
  }
});

app.post('/add-media', addMediaHandler);
app.put('/update-media', addMediaHandler); // The EditModal uses this endpoint

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

export default app;