const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

dotenv.config();

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS dictionary_cache (
            word TEXT PRIMARY KEY,
            data TEXT
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS search_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            word TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            word TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id),
            UNIQUE(user_id, word)
        )`);
    }
});

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_dev';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Auth Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Forbidden' });
        req.user = user;
        next();
    });
};

const optionalAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (!err) req.user = user;
            next();
        });
    } else {
        next();
    }
};

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, hashedPassword], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username already exists' });
                return res.status(500).json({ error: 'Database error' });
            }
            res.status(201).json({ message: 'User created successfully' });
        });
    } catch (e) {
        res.status(500).json({ error: 'Error hashing password' });
    }
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    
    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(400).json({ error: 'Invalid credentials' });
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: 'Invalid credentials' });
        
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, username: user.username });
    });
});

// Favorites Routes
app.get('/api/favorites', authenticateToken, (req, res) => {
    db.all(`SELECT f.word, c.data FROM favorites f LEFT JOIN dictionary_cache c ON f.word = c.word WHERE f.user_id = ? ORDER BY f.timestamp DESC`, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        const favorites = rows.map(row => {
            return {
                word: row.word,
                data: row.data ? JSON.parse(row.data) : null
            };
        });
        res.json(favorites);
    });
});

app.post('/api/favorites', authenticateToken, (req, res) => {
    const { word } = req.body;
    if (!word) return res.status(400).json({ error: 'Word required' });
    db.run(`INSERT INTO favorites (user_id, word) VALUES (?, ?)`, [req.user.id, word.toLowerCase()], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Already in favorites' });
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ message: 'Added to favorites' });
    });
});

app.delete('/api/favorites/:word', authenticateToken, (req, res) => {
    db.run(`DELETE FROM favorites WHERE user_id = ? AND word = ?`, [req.user.id, req.params.word.toLowerCase()], function(err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ message: 'Removed from favorites' });
    });
});

app.get('/api/history', optionalAuth, (req, res) => {
    let query = `SELECT DISTINCT word FROM search_history ORDER BY timestamp DESC LIMIT 15`;
    let params = [];
    if (req.user) {
        query = `SELECT DISTINCT word FROM search_history WHERE user_id = ? ORDER BY timestamp DESC LIMIT 15`;
        params = [req.user.id];
    }
    db.all(query, params, (err, rows) => {
        if (err) {
            console.error('DB Error:', err);
            return res.status(500).json({ error: 'Failed to fetch history' });
        }
        res.json(rows.map(row => row.word));
    });
});

app.post('/api/dictionary', optionalAuth, async (req, res) => {
    try {
        const { word } = req.body;
        if (!word) {
            return res.status(400).json({ error: 'Word is required' });
        }

        const lowercaseWord = word.toLowerCase();

        // 1. Check Cache
        db.get(`SELECT data FROM dictionary_cache WHERE word = ?`, [lowercaseWord], async (err, row) => {
            if (err) {
                console.error('DB Error:', err);
            }

            // Save to history regardless of cache hit
            const userId = req.user ? req.user.id : null;
            db.run(`INSERT INTO search_history (user_id, word) VALUES (?, ?)`, [userId, lowercaseWord]);

            if (row) {
                // Cache hit
                return res.json(JSON.parse(row.data));
            }

            // Cache miss - Fetch from APIs
            const prompt = `Provide the dictionary definition for the word: "${lowercaseWord}". Include:
1. "word" (the word itself)
2. "partOfSpeech"
3. "definition"
4. "example" (a short sentence)
5. "etymology" (a short sentence about its origin)
6. "synonyms" (array of up to 4 synonym strings)
7. "antonyms" (array of up to 4 antonym strings)

Format exactly as valid JSON with these keys. If it is not a valid word, return {"error": "Invalid word"}.`;

            try {
                const [groqRes, rhymesRes, adjectivesRes, wikiRes] = await Promise.allSettled([
                    fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${process.env.GROK_API_KEY}`
                        },
                        body: JSON.stringify({
                            model: 'llama-3.3-70b-versatile',
                            messages: [
                                { role: 'system', content: 'You are a helpful dictionary assistant. Always respond with only the requested JSON.' },
                                { role: 'user', content: prompt }
                            ],
                            temperature: 0.2
                        })
                    }),
                    fetch(`https://api.datamuse.com/words?rel_rhy=${encodeURIComponent(lowercaseWord)}&max=5`),
                    fetch(`https://api.datamuse.com/words?rel_jjb=${encodeURIComponent(lowercaseWord)}&max=5`),
                    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(lowercaseWord)}`)
                ]);

                if (groqRes.status === 'rejected' || !groqRes.value.ok) {
                    return res.status(500).json({ error: 'Failed to fetch primary definition' });
                }

                const data = await groqRes.value.json();
                const content = data.choices[0].message.content;
                
                let jsonStr = content.trim();
                if (jsonStr.startsWith('\`\`\`json')) {
                    jsonStr = jsonStr.substring(7, jsonStr.length - 3).trim();
                } else if (jsonStr.startsWith('\`\`\`')) {
                    jsonStr = jsonStr.substring(3, jsonStr.length - 3).trim();
                }
                
                let result = JSON.parse(jsonStr);
                
                if (result.error) {
                    return res.status(404).json(result);
                }

                // Process Rhymes
                if (rhymesRes.status === 'fulfilled' && rhymesRes.value.ok) {
                    const rhymesData = await rhymesRes.value.json();
                    result.rhymes = rhymesData.map(r => r.word);
                }

                // Process Adjectives
                if (adjectivesRes.status === 'fulfilled' && adjectivesRes.value.ok) {
                    const adjData = await adjectivesRes.value.json();
                    result.adjectives = adjData.map(a => a.word);
                }

                // Process Wikipedia
                if (wikiRes.status === 'fulfilled' && wikiRes.value.ok) {
                    const wikiData = await wikiRes.value.json();
                    if (wikiData.extract) {
                        result.wikiExtract = wikiData.extract;
                    }
                    if (wikiData.thumbnail && wikiData.thumbnail.source) {
                        result.wikiImage = wikiData.thumbnail.source;
                    }
                }

                // Save to cache
                db.run(`INSERT OR REPLACE INTO dictionary_cache (word, data) VALUES (?, ?)`, [lowercaseWord, JSON.stringify(result)]);

                res.json(result);

            } catch (apiError) {
                console.error('API Error:', apiError);
                res.status(500).json({ error: 'Internal server error during API fetches' });
            }
        });
    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Ensure you have added your GROK_API_KEY to the .env file.');
});
