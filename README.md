# Notebook

A serverless notebook app built with React, Vite, MongoDB, and Vercel API routes. Users can create, edit, and delete notes with a title and content.

## Features

- React + Vite frontend
- MongoDB persistence
- Strictly serverless backend on Vercel
- Create, edit, and delete notebook entries
- Responsive, polished UI

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env.local` file with your MongoDB connection string:

```bash
MONGODB_URI="your-mongodb-connection-string"
MONGODB_DB="notebook"
AUTH_USERNAME="your-username"
AUTH_PASSWORD="your-password"
AUTH_SECRET="generate-a-long-random-secret"
```

3. Start the local frontend:

```bash
npm run dev
```

This starts Vite on port 5173 and Vercel's local function emulator on port 3000, with the frontend proxying `/api` requests to the emulator. Sign in with the username and password from your environment variables.

## Deploy to Vercel

- Push this repository to GitHub.
- Import it into Vercel.
- Add `MONGODB_URI`, `MONGODB_DB`, `AUTH_USERNAME`, `AUTH_PASSWORD`, and `AUTH_SECRET` as environment variables in Vercel.
- Deploy with the default build command `npm run build`.

## API

- `GET /api/notebooks` returns all notes.
- `POST /api/notebooks` creates a note.
- `GET /api/notebooks/:id` returns one note.
- `PATCH /api/notebooks/:id` updates a note.
- `DELETE /api/notebooks/:id` removes a note.
