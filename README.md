# Entracker

**Entracker** is a beautifully designed, modern web application built to help you track your watched movies, TV shows, and anime. It features a cinematic user interface, responsive progressive web app (PWA) capabilities, and an admin/viewer role-based access system.

## 🚀 Features
* **Cinematic UI:** Beautiful animated mesh backgrounds, dark/light themes, and glassmorphism elements.
* **Media Tracking:** Categorized views for Movies, Series, and Anime.
* **Smart Search:** Real-time search suggestions powered by the TMDB API.
* **Role-Based Access Control:**
  * **Viewers:** Anyone can visit the site and view your library.
  * **Admin:** Secret admin login (double click the top-left logo) allows you to add, edit, or delete media.
* **Progressive Web App (PWA):** Installable on mobile devices to act as a native application.
* **Headless Database:** Uses Google Sheets as a database via the Google Sheets API for ultimate flexibility and portability.

## 🛠️ Tech Stack
**Frontend:**
* React (Vite)
* TypeScript
* Framer Motion (Animations)
* Vanilla CSS / Tailwind (Styling)

**Backend:**
* Node.js & Express
* TypeScript
* TMDB API (Metadata fetching)
* Google Sheets API (Database)
* JSON Web Tokens (JWT Authentication)

## 💻 Local Setup
1. Clone the repository.
2. Install frontend dependencies:
   ```bash
   cd client
   npm install
   ```
3. Install backend dependencies:
   ```bash
   cd server
   npm install
   ```
4. Create a `.env` file in the `server` directory with your secrets (see `DEVELOPMENT.md` for the required keys).
5. Run the dev servers:
   * Frontend: `npm run dev` (in `/client`)
   * Backend: `npm run dev` (in `/server`)
