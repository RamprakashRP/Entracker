# Development & Deployment Guide

This document outlines the architecture, cloud infrastructure, and deployment requirements for Entracker. It is intended for internal developers managing the system.

## 🏗️ Architecture
Entracker relies on a decoupled architecture:
- **Frontend (Vercel):** Handles the UI and routing. Built with Vite and React.
- **Backend (Heroku):** Serves as an API gateway. Handles authentication, TMDB metadata fetching, and database operations.
- **Database (Google Sheets):** A headless database utilizing the Google Sheets API. Fast, portable, and easily viewable by humans.

## 🔐 Environment Variables

### Backend (Heroku)
The Node.js server requires the following environment variables to run. These must be set in your `server/.env` file locally, and in the **Config Vars** section of your Heroku Dashboard for production.

* `PORT`: Automatically set by Heroku (do not set manually in prod).
* `TMDB_API_KEY`: Your The Movie Database API Key (v3 auth).
* `SPREADSHEET_ID`: The unique ID of the Google Sheet acting as the database.
* `GOOGLE_APPLICATION_CREDENTIALS`: A stringified version of your Google Cloud Service Account JSON key.
* `ADMIN_PASSWORD`: The secret password required to unlock Admin capabilities (e.g., `mysecretpassword123`).
* `JWT_SECRET`: A long, random string used to sign JSON Web Tokens for authentication.

### Frontend (Vercel)
The Vite frontend requires only one environment variable to function in production. This must be set in your Vercel Project Dashboard.

* `VITE_API_BASE_URL`: The URL of your deployed Heroku backend (e.g., `https://entracker-backend-xxxx.herokuapp.com`).

**Important Note:** When running locally, Vite expects the backend to be on `http://localhost:5000`. You do not need to set `VITE_API_BASE_URL` locally unless you change the server port.

## 🚢 Deployment Steps

### Deploying the Backend (Heroku)
1. Ensure the Heroku CLI is installed and you are logged in.
2. The `server/package.json` contains a `build` script (`tsc`). Heroku automatically runs this.
3. Ensure all `@types/*` dependencies are located in `"dependencies"` (not `"devDependencies"`), otherwise the Heroku build will fail.
4. Push to the Heroku remote branch (or let GitHub Actions deploy it automatically on push to `main`).

### Deploying the Frontend (Vercel)
1. Link your GitHub repository to Vercel.
2. Set the Framework Preset to `Vite`.
3. Set the Root Directory to `client`.
4. Vercel will automatically build (`npm run build`) and deploy the application on every push to the `main` branch.

## 👤 Admin Access (RBAC)
The application defaults to a "Viewer" mode where all media can be browsed but not modified.
- To access **Admin Mode**, double-click the Entracker logo in the top-left corner of the website.
- Enter the `ADMIN_PASSWORD`.
- A JWT token is issued, which lasts for 10 years (persistent login). The "Add Media" tab and Edit buttons will become visible.
