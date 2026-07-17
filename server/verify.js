const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');

async function testAccess() {
  const auth = new GoogleAuth({
    keyFile: 'credentials.json',
    scopes: 'https://www.googleapis.com/auth/spreadsheets'
  });

  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });  // Corrected this line

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: 'Sheet1!A1:E1'
  });

  console.log('Column Headers:', response.data.values);
}

testAccess();
