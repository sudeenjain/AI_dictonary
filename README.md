# Lexis AI — Intelligent Dictionary

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Deployed on Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel)](https://vercel.com/)

> An AI-powered dictionary that goes beyond definitions — explore etymology, synonyms, antonyms, rhymes, Wikipedia context, voice search, and flashcard study mode. Powered by **Groq (LLaMA 3.3 70B)** with **Google Gemini** fallback.

**Live demo:** [ai-dictonary.vercel.app](https://ai-dictonary.vercel.app)

---

## Features

| Feature | Description |
|--------|-------------|
| AI Lookup | Real-time definitions via Groq with Gemini fallback |
| Rich Data | Definition, pronunciation, etymology, examples, synonyms, antonyms |
| Enrichment | Datamuse rhymes/adjectives + Wikipedia summaries |
| Word of the Day | Curated daily vocabulary |
| Trending Words | Popular searches across users |
| Auth | JWT register/login with bcrypt hashing |
| Favorites | Save and revisit words |
| Search History | Per-user and anonymous global history |
| Study Mode | Flashcard practice from favorites |
| Voice Search | Browser speech recognition |
| Smart Cache | 7-day SQLite cache to reduce API calls |
| Responsive UI | Mobile-first layout with light/dark themes |
| Security | Helmet, rate limiting, input sanitization |

---

## Tech Stack

**Backend**

- Node.js 18+ / Express 5
- sql.js (SQLite via WebAssembly — no native bindings)
- bcryptjs, jsonwebtoken, node-fetch
- helmet, compression, express-rate-limit

**Frontend**

- Vanilla HTML / CSS / JavaScript
- Playfair Display + DM Sans typography
- CSS custom properties, responsive grid

**AI Services**

- [Groq](https://console.groq.com/) — Primary (LLaMA 3.3 70B)
- [Google Gemini](https://aistudio.google.com/) — Fallback

**Free APIs**

- [Datamuse](https://www.datamuse.com/api/) — Rhymes & related adjectives
- [Wikipedia REST](https://www.mediawiki.org/wiki/API:REST_API) — Summaries

---

## Folder Structure

```
AI_dictonary/
├── server.js              # Express entry + middleware
├── database.js            # SQLite (sql.js) helpers
├── package.json
├── vercel.json            # Vercel serverless config
├── .env.example
├── routes/
│   ├── auth.js            # Register, login, verify
│   └── dictionary.js      # Lookup, favorites, history
├── middleware/
│   ├── auth.js            # JWT middleware
│   └── rateLimit.js       # API rate limits
├── utils/
│   ├── aiLookup.js        # Groq & Gemini
│   ├── enrichment.js      # Datamuse + Wikipedia
│   └── sanitize.js        # Input validation
└── public/
    ├── index.html
    ├── favicon.png
    ├── css/style.css
    └── js/app.js
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm 8+
- Groq API key (free at [console.groq.com](https://console.groq.com/))
- Gemini API key (optional, [aistudio.google.com](https://aistudio.google.com/))

### Installation

```bash
git clone https://github.com/sudeenjain/AI_dictonary.git
cd AI_dictonary
npm install
cp .env.example .env
# Edit .env with your keys
npm start
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: `3000`) |
| `JWT_SECRET` | Yes (prod) | Secret for JWT signing |
| `GROQ_API_KEY` | Yes* | Groq API key |
| `GEMINI_API_KEY` | No* | Gemini fallback key |
| `NODE_ENV` | No | `development` or `production` |
| `CORS_ORIGIN` | No | Allowed origin (optional) |

\* At least one of `GROQ_API_KEY` or `GEMINI_API_KEY` is required.

**Never commit `.env` or expose API keys in client-side code.**

---

## API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register user |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/verify` | Verify JWT |

### Dictionary

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/dictionary/lookup/:word` | Optional | Look up word |
| POST | `/api/dictionary/lookup` | Optional | Look up word (JSON body) |
| GET | `/api/dictionary/word-of-the-day` | No | Daily word |
| GET | `/api/dictionary/popular` | No | Trending words |
| GET | `/api/dictionary/history` | Optional | Search history |
| DELETE | `/api/dictionary/history` | Required | Clear user history |
| GET | `/api/dictionary/favorites` | Required | List favorites |
| POST | `/api/dictionary/favorites/:word` | Required | Add favorite |
| DELETE | `/api/dictionary/favorites/:word` | Required | Remove favorite |
| GET | `/api/health` | No | Health check |

---

## Screenshots

| Home | Word Result | Study Mode |
|------|-------------|------------|
| _Add screenshot: `docs/screenshots/home.png`_ | _Add screenshot: `docs/screenshots/result.png`_ | _Add screenshot: `docs/screenshots/study.png`_ |

---

## Mobile & Responsive Design

- **Mobile (320px+):** Collapsible nav, touch-friendly 44px targets, stacked result grid
- **Tablet (768px+):** Two-column result layout, expanded navigation
- **Desktop (1024px+):** Full hero typography and side-by-side cards
- **Accessibility:** `prefers-reduced-motion`, ARIA labels, keyboard flashcard flip
- **Themes:** Dark (default) and light via toggle (persisted in `localStorage`)

---

## Deployment

### Vercel (recommended)

1. Import [github.com/sudeenjain/AI_dictonary](https://github.com/sudeenjain/AI_dictonary)
2. Framework preset: **Other**
3. Add environment variables: `JWT_SECRET`, `GROQ_API_KEY`, `GEMINI_API_KEY`
4. Deploy

```bash
npm i -g vercel
vercel login
vercel --prod
```

> SQLite persists in `/tmp` on Vercel serverless. For durable data, use Render/Railway or an external DB.

### Render / Railway

- Build: `npm install`
- Start: `npm start`
- Set all environment variables in the dashboard

---

## Performance Optimizations

- 7-day dictionary cache in SQLite
- Gzip compression via `compression` middleware
- Static asset caching in production
- Parallel enrichment API calls (Datamuse + Wikipedia)
- Debounced search suggestions
- Skeleton loaders for Word of the Day and trending
- Lazy font loading via `preconnect`

---

## Security

- Passwords hashed with bcrypt (10 rounds)
- JWT tokens (7-day expiry)
- API keys only in server environment variables
- Input sanitization on words and usernames
- XSS prevention via HTML escaping in frontend
- Helmet security headers
- Rate limiting on auth and lookup endpoints

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `Failed to lookup word` | Verify `GROQ_API_KEY` or `GEMINI_API_KEY` in `.env` |
| Auth errors in production | Set a strong `JWT_SECRET` |
| Database resets on Vercel | Expected — use Render/Railway for persistent SQLite |
| Voice search unavailable | Use Chrome/Edge; requires HTTPS in production |
| Rate limit errors | Wait 1 minute; limits reset automatically |

---

## Contributing

1. Fork the repository
2. Create a branch: `git checkout -b feature/my-feature`
3. Commit: `git commit -m 'Add my feature'`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

---

## License

MIT License — see [LICENSE](LICENSE).

---

## Acknowledgments

- [Groq](https://groq.com/) for fast LLaMA inference
- [Google AI](https://ai.google/) for Gemini
- [Datamuse](https://www.datamuse.com/) for word relations
- IBM Miniproject origin — evolved into Lexis AI

---

<p align="center">Built with care by <strong>Sudeen Jain</strong></p>
