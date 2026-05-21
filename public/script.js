document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const micBtn = document.getElementById('micBtn');
    const listeningIndicator = document.getElementById('listeningIndicator');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const resultsContainer = document.getElementById('resultsContainer');
    const errorContainer = document.getElementById('errorContainer');
    const errorText = document.getElementById('errorText');
    const historyList = document.getElementById('historyList');
    
    // Auth Elements
    const loginBtn = document.getElementById('loginBtn');
    const userProfile = document.getElementById('userProfile');
    const userNameDisplay = document.getElementById('userNameDisplay');
    const logoutBtn = document.getElementById('logoutBtn');
    
    const authModal = document.getElementById('authModal');
    const closeAuthModal = document.getElementById('closeAuthModal');
    const btnShowLogin = document.getElementById('btnShowLogin');
    const btnShowRegister = document.getElementById('btnShowRegister');
    const authForm = document.getElementById('authForm');
    const authUsername = document.getElementById('authUsername');
    const authPassword = document.getElementById('authPassword');
    const authSubmitBtn = document.getElementById('authSubmitBtn');
    const authError = document.getElementById('authError');
    const authSuccess = document.getElementById('authSuccess');
    
    // Sidebar Elements
    const tabHistory = document.getElementById('tabHistory');
    const tabFavorites = document.getElementById('tabFavorites');
    const contentHistory = document.getElementById('contentHistory');
    const contentFavorites = document.getElementById('contentFavorites');
    const authWarning = document.getElementById('authWarning');
    const favoritesContainer = document.getElementById('favoritesContainer');
    const favoritesList = document.getElementById('favoritesList');
    
    // Study Mode Elements
    const studyModeBtn = document.getElementById('studyModeBtn');
    const studyModal = document.getElementById('studyModal');
    const closeStudyModal = document.getElementById('closeStudyModal');
    const flashcard = document.getElementById('flashcard');
    const studyWordFront = document.getElementById('studyWordFront');
    const studyWordBack = document.getElementById('studyWordBack');
    const studyDefinitionBack = document.getElementById('studyDefinitionBack');
    const studyCurrentIndex = document.getElementById('studyCurrentIndex');
    const studyTotalCards = document.getElementById('studyTotalCards');
    const studyPrevBtn = document.getElementById('studyPrevBtn');
    const studyNextBtn = document.getElementById('studyNextBtn');
    
    // --- State ---
    let searchHistory = [];
    let myFavorites = [];
    let currentStudyIndex = 0;
    let isRegisterMode = false;
    let currentWordData = null; // Stores last searched data
    
    // --- Helper: Auth Header ---
    function getAuthHeaders() {
        const token = localStorage.getItem('voxDictToken');
        return {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        };
    }

    // --- Auth Logic ---
    function checkAuthState() {
        const token = localStorage.getItem('voxDictToken');
        const username = localStorage.getItem('voxDictUser');
        if (token && username) {
            loginBtn.classList.add('hidden');
            userProfile.classList.remove('hidden');
            userNameDisplay.textContent = username;
            authWarning.classList.add('hidden');
            favoritesContainer.classList.remove('hidden');
            fetchFavorites();
        } else {
            loginBtn.classList.remove('hidden');
            userProfile.classList.add('hidden');
            authWarning.classList.remove('hidden');
            favoritesContainer.classList.add('hidden');
            myFavorites = [];
            renderFavorites();
        }
    }

    loginBtn.addEventListener('click', () => {
        authModal.classList.remove('hidden');
    });

    closeAuthModal.addEventListener('click', () => {
        authModal.classList.add('hidden');
    });

    btnShowLogin.addEventListener('click', () => {
        isRegisterMode = false;
        btnShowLogin.classList.add('active');
        btnShowRegister.classList.remove('active');
        authSubmitBtn.textContent = 'Login';
        authError.classList.add('hidden');
        authSuccess.classList.add('hidden');
    });

    btnShowRegister.addEventListener('click', () => {
        isRegisterMode = true;
        btnShowRegister.classList.add('active');
        btnShowLogin.classList.remove('active');
        authSubmitBtn.textContent = 'Register';
        authError.classList.add('hidden');
        authSuccess.classList.add('hidden');
    });

    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = authUsername.value.trim();
        const password = authPassword.value.trim();
        
        authError.classList.add('hidden');
        authSuccess.classList.add('hidden');
        
        const endpoint = isRegisterMode ? '/api/auth/register' : '/api/auth/login';
        
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error);
            
            if (isRegisterMode) {
                authSuccess.textContent = 'Registration successful! You can now log in.';
                authSuccess.classList.remove('hidden');
                setTimeout(() => btnShowLogin.click(), 1500);
            } else {
                localStorage.setItem('voxDictToken', data.token);
                localStorage.setItem('voxDictUser', data.username);
                authModal.classList.add('hidden');
                checkAuthState();
                fetchHistory(); // Refresh history with user context
                if (currentWordData) displayResult(currentWordData);
            }
        } catch (err) {
            authError.textContent = err.message;
            authError.classList.remove('hidden');
        }
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('voxDictToken');
        localStorage.removeItem('voxDictUser');
        checkAuthState();
        fetchHistory(); // Refresh history to global
        if (currentWordData) displayResult(currentWordData); // update star
    });

    // --- Sidebar Tabs Logic ---
    tabHistory.addEventListener('click', () => {
        tabHistory.classList.add('active');
        tabFavorites.classList.remove('active');
        contentHistory.classList.remove('hidden');
        contentFavorites.classList.add('hidden');
    });

    tabFavorites.addEventListener('click', () => {
        tabFavorites.classList.add('active');
        tabHistory.classList.remove('active');
        contentFavorites.classList.remove('hidden');
        contentHistory.classList.add('hidden');
    });

    // --- Loading Data ---
    async function fetchHistory() {
        try {
            const res = await fetch('/api/history', { headers: getAuthHeaders() });
            if (res.ok) {
                searchHistory = await res.json();
                renderHistory();
            }
        } catch (err) { console.error('Failed to load history', err); }
    }

    async function fetchFavorites() {
        if (!localStorage.getItem('voxDictToken')) return;
        try {
            const res = await fetch('/api/favorites', { headers: getAuthHeaders() });
            if (res.ok) {
                myFavorites = await res.json();
                renderFavorites();
                if (currentWordData) displayResult(currentWordData);
            }
        } catch (err) { console.error('Failed to load favorites', err); }
    }

    function renderHistory() {
        if (searchHistory.length === 0) {
            historyList.innerHTML = '<li class="history-item" style="justify-content:center;color:#64748b">No recent searches</li>';
            return;
        }
        historyList.innerHTML = searchHistory.map(word => `
            <li class="history-item" onclick="searchFromHistory('${word}')">
                <span class="history-word"><i class="fa-solid fa-clock-rotate-left" style="font-size:0.75rem;margin-right:8px;color:#cbd5e1"></i> ${word}</span>
                <i class="fa-solid fa-chevron-right history-arrow"></i>
            </li>
        `).join('');
    }

    function renderFavorites() {
        if (myFavorites.length === 0) {
            favoritesList.innerHTML = '<li class="history-item" style="justify-content:center;color:#64748b">No favorites saved</li>';
            return;
        }
        favoritesList.innerHTML = myFavorites.map(fav => `
            <li class="history-item" onclick="searchFromHistory('${fav.word}')">
                <span class="history-word"><i class="fa-solid fa-star" style="font-size:0.75rem;margin-right:8px;color:#fbbf24"></i> ${fav.word}</span>
                <i class="fa-solid fa-chevron-right history-arrow"></i>
            </li>
        `).join('');
    }

    // --- Add/Remove Favorite Logic ---
    window.toggleFavorite = async function(word) {
        if (!localStorage.getItem('voxDictToken')) {
            alert("Please log in to save favorites.");
            return;
        }
        
        const isFav = myFavorites.some(f => f.word === word);
        try {
            if (isFav) {
                await fetch(`/api/favorites/${word}`, { method: 'DELETE', headers: getAuthHeaders() });
            } else {
                await fetch('/api/favorites', {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ word })
                });
            }
            await fetchFavorites();
        } catch (err) { console.error('Error toggling fav', err); }
    };

    // --- Flashcard Study Mode Logic ---
    studyModeBtn.addEventListener('click', () => {
        if (myFavorites.length === 0) {
            alert("Save some words to favorites first to practice them!");
            return;
        }
        currentStudyIndex = 0;
        updateStudyCard();
        studyModal.classList.remove('hidden');
    });

    closeStudyModal.addEventListener('click', () => {
        studyModal.classList.add('hidden');
        flashcard.classList.remove('is-flipped');
    });

    flashcard.addEventListener('click', () => {
        flashcard.classList.toggle('is-flipped');
    });

    studyNextBtn.addEventListener('click', () => {
        if (currentStudyIndex < myFavorites.length - 1) {
            currentStudyIndex++;
            flashcard.classList.remove('is-flipped');
            setTimeout(updateStudyCard, 150);
        }
    });

    studyPrevBtn.addEventListener('click', () => {
        if (currentStudyIndex > 0) {
            currentStudyIndex--;
            flashcard.classList.remove('is-flipped');
            setTimeout(updateStudyCard, 150);
        }
    });

    function updateStudyCard() {
        const fav = myFavorites[currentStudyIndex];
        studyTotalCards.textContent = myFavorites.length;
        studyCurrentIndex.textContent = currentStudyIndex + 1;
        studyWordFront.textContent = fav.word;
        studyWordBack.textContent = fav.word;
        studyDefinitionBack.textContent = fav.data ? fav.data.definition : "Definition not available.";
    }

    // --- Search Logic ---
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;
    let isListening = false;

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            isListening = true;
            micBtn.classList.add('active');
            listeningIndicator.classList.remove('hidden');
            searchInput.placeholder = "Listening...";
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript.trim();
            const word = transcript.split(' ')[0].replace(/[^a-zA-Z-]/g, '');
            searchInput.value = word;
            if (word) {
                fetchDefinition(word);
            } else {
                showError("Could not understand a valid word. Please try again.");
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            showError("Microphone error: " + event.error);
            stopListening();
        };

        recognition.onend = () => {
            stopListening();
        };
    } else {
        micBtn.style.display = 'none';
        searchInput.placeholder = "Speech recognition not supported in browser.";
    }

    function toggleListening() {
        if (!recognition) return;
        if (isListening) {
            recognition.stop();
        } else {
            errorContainer.classList.add('hidden');
            recognition.start();
        }
    }

    function stopListening() {
        isListening = false;
        micBtn.classList.remove('active');
        listeningIndicator.classList.add('hidden');
        searchInput.placeholder = "Search a word or tap microphone...";
    }

    micBtn.addEventListener('click', toggleListening);

    searchBtn.addEventListener('click', () => {
        const word = searchInput.value.trim();
        if (word) fetchDefinition(word);
    });

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const word = searchInput.value.trim();
            if (word) fetchDefinition(word);
        }
    });

    window.searchFromHistory = function(word) {
        searchInput.value = word;
        fetchDefinition(word);
    };

    async function fetchDefinition(word) {
        word = word.toLowerCase();
        resultsContainer.classList.add('hidden');
        errorContainer.classList.add('hidden');
        loadingIndicator.classList.remove('hidden');

        try {
            const response = await fetch('/api/dictionary', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ word })
            });
            const data = await response.json();
            if (!response.ok || data.error) throw new Error(data.error || 'Failed to fetch definition');

            currentWordData = data;
            displayResult(data);
            fetchHistory(); // Refresh history
        } catch (err) {
            showError(err.message);
        } finally {
            loadingIndicator.classList.add('hidden');
        }
    }

    function displayResult(data) {
        const { word, partOfSpeech, definition, example, etymology, synonyms, antonyms, rhymes, adjectives, wikiExtract } = data;
        
        const makeTags = (items, title, pillClass) => {
            if (!items || items.length === 0) return '';
            return `
                <div class="tags-box">
                    <h3>${title}</h3>
                    <div class="tags-container">
                        ${items.map(i => `<span class="pill ${pillClass}" onclick="searchFromHistory('${i.replace(/'/g, "\\'")}')">${i}</span>`).join('')}
                    </div>
                </div>
            `;
        };

        const synonymsHtml = makeTags(synonyms, 'Synonyms', 'pill-synonym');
        const antonymsHtml = makeTags(antonyms, 'Antonyms', 'pill-antonym');
        const rhymesHtml = makeTags(rhymes, 'Rhymes', 'pill-rhyme');
        const adjectivesHtml = makeTags(adjectives, 'Related Adjectives', 'pill-adjective');
        
        const isFav = myFavorites.some(f => f.word === word);
        
        resultsContainer.innerHTML = `
            <div class="word-header">
                <div class="word-title-group">
                    <div>
                        <h2>${word}</h2>
                        ${partOfSpeech ? `<span class="part-of-speech">${partOfSpeech}</span>` : ''}
                    </div>
                </div>
                <div class="word-actions">
                    <button class="fav-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite('${word.replace(/'/g, "\\'")}')" title="${isFav ? 'Remove from Favorites' : 'Save to Favorites'}">
                        <i class="fa-solid fa-star"></i>
                    </button>
                    <button class="play-btn" id="playAudioBtn" aria-label="Play pronunciation" title="Listen to definition">
                        <i class="fa-solid fa-volume-high"></i>
                    </button>
                </div>
            </div>
            
            <div class="content-grid">
                <div class="definition-box">
                    <h3>Definition</h3>
                    <p class="definition-text">${definition}</p>
                    ${example ? `
                    <div class="example-box">
                        <p>"${example}"</p>
                    </div>` : ''}
                </div>
                
                ${wikiExtract ? `
                <div class="wiki-box">
                    <h3>Wikipedia Abstract</h3>
                    <p>${wikiExtract}</p>
                </div>` : ''}

                ${etymology ? `
                <div class="etymology-box">
                    <h3>Origin (Etymology)</h3>
                    <p class="etymology-text">${etymology}</p>
                </div>` : ''}
                
                ${synonymsHtml}
                ${antonymsHtml}
                ${rhymesHtml}
                ${adjectivesHtml}
            </div>
        `;
        
        resultsContainer.classList.remove('hidden');

        const playAudioBtn = document.getElementById('playAudioBtn');
        playAudioBtn.addEventListener('click', () => {
            speakText(`${word}. ${partOfSpeech ? partOfSpeech + '.' : ''}. Definition: ${definition}. ${example ? 'Example: ' + example : ''}`);
        });
    }

    function speakText(text) {
        if (!window.speechSynthesis) return alert('Text-to-speech not supported.');
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(v => v.lang.includes('en-GB') || v.name.includes('Google UK') || v.lang.includes('en-US'));
        if (preferredVoice) utterance.voice = preferredVoice;
        window.speechSynthesis.speak(utterance);
    }

    function showError(msg) {
        errorText.textContent = msg;
        errorContainer.classList.remove('hidden');
    }
    
    // Init
    window.speechSynthesis.getVoices();
    checkAuthState();
    fetchHistory();
});
