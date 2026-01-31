# SNO-RELAX — Server

**SNO-RELAX** — AI-Assisted Mental Health & Wellness Platform

**Module:** Backend API & Real-time server

**Status:** Final Year Project — Final submission ready

---

## Summary
This repository contains the server-side implementation for SNO-RELAX. It exposes REST endpoints for authentication, mood logging, community features, report summarization, and admin configuration. Real-time features (group chat, notifications) are implemented using Socket.IO. The server also integrates with AI services (Cohere) for chatbot and summarization requests.

> **Academic Declaration:** This module is part of the Final Year Project "SNO-RELAX" and is prepared for academic submission.

---

## Key Features
- RESTful API for user, mood, content, and admin endpoints
- Socket.IO for real-time messaging and notifications
- AI integration for chatbot and report summarization
- Authentication and role-based admin endpoints
- File handling for secure report uploads

---

## Tech Stack
- Node.js & Express
- Socket.IO
- MongoDB (Mongoose)
- Axios or node-fetch for external API calls
- Optional Python utilities for offline training and data processing (in `scripts/`)

---

## Required Environment Variables
Copy `.env.example` to `.env` and set values:
- `MONGO_URI` — MongoDB connection string
- `PORT` — Server port (default 5000)
- `JWT_SECRET` — Secret for signing JWT tokens
- `COHERE_API_KEY` — (Optional) Cohere API key for AI features
- `ADMIN_SECRET` — (Optional) temporary admin secret (replace with role-based JWT in production)

---

## Installation & Run
1. Install dependencies
```bash
npm install
```

2. Start in development
```bash
npm start
```

3. Run tests (if provided)
```bash
npm test
```

---

## API Examples
- `GET /` — Health check
- `POST /api/auth/login` — Authentication
- `POST /api/moods/:userId` — Save mood entry
- `POST /api/chat` — Send message to chatbot (server calls AI provider)
- `GET /api/community/groups` — List groups
- Admin endpoints are prefixed with `/api/admin/*` and require authentication

---

## Security & Deployment Notes
- Use secure storage for secrets and environment variables in production.
- For production-grade auth, use JWT with role-based access and avoid secret headers.
- Sanitize and validate uploads before processing with AI services.

---

## Contributing & Authors
- Project Creator / Lead Developer: **Shivam Kumar Dubey** — GitHub: https://github.com/shivamdubey023
- Co-Creator: **Suryakant Mishra**

---

For architecture and academic documentation see the top-level `SNO-RELAX/` folder in this repository.
