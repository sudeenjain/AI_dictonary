const fetch = require('node-fetch');
const { enrichWordData } = require('./enrichment');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const JSON_SCHEMA_HINT = `Return ONLY valid JSON (no markdown) with:
{
  "word": "the word",
  "partOfSpeech": "noun/verb/adjective/etc",
  "pronunciation": "phonetic pronunciation",
  "definition": "clear comprehensive definition",
  "example": "natural example sentence",
  "etymology": "word origin",
  "synonyms": ["syn1", "syn2", "syn3", "syn4"],
  "antonyms": ["ant1", "ant2", "ant3"],
  "relatedWords": ["rel1", "rel2", "rel3"],
  "difficulty": "beginner|intermediate|advanced",
  "category": "subject category"
}`;

function parseAiJson(content) {
  let jsonStr = content.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  }
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Invalid JSON response from AI');
  const parsed = JSON.parse(jsonMatch[0]);
  if (parsed.error) throw new Error(parsed.error);
  return parsed;
}

async function lookupWordWithGroq(word) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are an expert lexicographer. Respond with JSON only.'
        },
        {
          role: 'user',
          content: `Provide dictionary information for: "${word}". ${JSON_SCHEMA_HINT}`
        }
      ],
      temperature: 0.2,
      max_tokens: 900
    })
  });

  if (!response.ok) throw new Error(`Groq API error: ${response.status}`);
  const data = await response.json();
  return parseAiJson(data.choices[0].message.content);
}

async function lookupWordWithGemini(word) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Provide dictionary information for: "${word}". ${JSON_SCHEMA_HINT}`
              }
            ]
          }
        ],
        generationConfig: { temperature: 0.2, maxOutputTokens: 900 }
      })
    }
  );

  if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Empty Gemini response');
  return parseAiJson(content);
}

async function lookupWord(word) {
  let baseData;

  if (GROQ_API_KEY) {
    try {
      baseData = await lookupWordWithGroq(word);
    } catch (groqErr) {
      console.warn('Groq failed:', groqErr.message);
      if (!GEMINI_API_KEY) throw groqErr;
    }
  }

  if (!baseData && GEMINI_API_KEY) {
    baseData = await lookupWordWithGemini(word);
  }

  if (!baseData) {
    throw new Error('No AI API keys configured. Set GROQ_API_KEY or GEMINI_API_KEY.');
  }

  baseData.word = baseData.word || word;
  return enrichWordData(word, baseData);
}

async function getWordOfTheDay() {
  const words = [
    'ephemeral', 'serendipity', 'melancholy', 'luminous', 'resilience',
    'paradox', 'eloquence', 'vivacious', 'tenacious', 'labyrinth',
    'euphoria', 'catalyst', 'enigmatic', 'ubiquitous', 'petrichor'
  ];
  const today = new Date();
  const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 86400000);
  const word = words[dayOfYear % words.length];
  return { word, date: today.toISOString().split('T')[0] };
}

module.exports = { lookupWord, getWordOfTheDay };
