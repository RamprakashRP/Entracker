/* client/src/App.tsx */
import { useState, useRef, useEffect, useCallback, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import axios from "axios";
import MediaListView from './MediaListView';
import { DisambiguationModal, type TMDBResult } from './DisambiguationModal';
import { MediaDetailsModal } from './MediaDetailsModal';
import { ConfirmationModal } from './ConfirmationModal';
import DotGrid from './DotGrid';
import { HomeView } from './HomeView';
import { LoginModal } from './components/LoginModal';

const API_BASE = import.meta.env.PROD ? '' : 'http://localhost:5000';

type MediaType = "series" | "movie" | "anime" | "anime_movie" | "";

const mediaLabels: Record<MediaType, string> = {
    series: "TV Series", movie: "Movie", anime: "Anime Series",
    anime_movie: "Anime Movie", '': 'Select Media Type'
};

const sortedMediaOptions = Object.entries(mediaLabels).filter(([key]) => key !== '').sort(([, a], [, b]) => a.localeCompare(b));

interface FetchedMediaItem {
    series_name?: string; movies_name?: string; anime_name?: string;
    row_index: number; media_type_key: MediaType; watched_till?: string; [key: string]: any;
}

const initialForm = {
    mediaType: "" as MediaType, mediaName: "", seasonNumber: "", episodeNumber: "", watchedTill: "",
};

// MediaDropdown removed in favor of styled native select for better accessibility and UX

import { EditModal } from './EditModal';

export default function App() {
    const [activeTab, setActiveTab] = useState<'home' | 'add' | 'library'>('home');
    const [form, setForm] = useState(initialForm);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ message: string; details?: any } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [editingItem, setEditingItem] = useState<any | null>(null);
    const [allMediaData, setAllMediaData] = useState<FetchedMediaItem[]>([]);
    const [suggestions, setSuggestions] = useState<FetchedMediaItem[]>([]);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');

    useEffect(() => {
        const storedTheme = localStorage.getItem('entracker_theme') as 'dark' | 'light' | null;
        if (storedTheme) {
            setTheme(storedTheme);
            document.documentElement.setAttribute('data-theme', storedTheme);
        }

        const token = localStorage.getItem('entracker_token');
        if (token) {
            setIsAdmin(true);
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        }
    }, []);

    const handleLoginSuccess = (token: string) => {
        localStorage.setItem('entracker_token', token);
        setIsAdmin(true);
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    };

    const handleLogout = () => {
        localStorage.removeItem('entracker_token');
        setIsAdmin(false);
        delete axios.defaults.headers.common['Authorization'];
        if (activeTab === 'add') setActiveTab('home');
    };

    const toggleTheme = () => {
        const newTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        localStorage.setItem('entracker_theme', newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
    };

    
    const [modalState, setModalState] = useState<{
        isOpen: boolean; title: string; message: string;
        confirmText: string; onConfirm: () => void;
    }>({ isOpen: false, title: '', message: '', confirmText: 'Yes', onConfirm: () => {} });
    const [disambiguation, setDisambiguation] = useState<{ isOpen: boolean; results: TMDBResult[]; isWatched: boolean }>({ isOpen: false, results: [], isWatched: false });
    const [detailsItem, setDetailsItem] = useState<{ name: string; type: string } | null>(null);

    const fetchAllMediaData = useCallback(async () => {
        try {
            const types: MediaType[] = ["series", "movie", "anime", "anime_movie"];
            let allData: FetchedMediaItem[] = [];
            for (const type of types) {
                if (!type) continue;
                const response = await axios.get(`${API_BASE}/api/get-media/${type}`);
                allData = allData.concat((response.data.data || []).map((item: any) => ({ ...item, media_type_key: type })));
            }
            setAllMediaData(allData);
        } catch (err) { console.error("Failed to fetch media data:", err); }
    }, []);

    useEffect(() => { fetchAllMediaData(); }, [fetchAllMediaData]);
    
    const handleFormSubmit = async (isWatched: boolean) => {
        if (!form.mediaType || !form.mediaName) { setError("Please select a media type and enter a name."); return; }
        setLoading(true);
        setError(null);
        setResult(null);

        try {
            // First, check for local exact duplicates to avoid unnecessary API calls
            const nameKey = form.mediaType.includes('movie') ? 'movies_name' : `${form.mediaType}_name`;
            const localDuplicate = allMediaData.find(item => item[nameKey]?.toLowerCase() === form.mediaName.toLowerCase());

            if(localDuplicate) {
                 if (localDuplicate.watched === 'False' && isWatched) {
                    setModalState({
                        isOpen: true, title: "Item in Watchlist",
                        message: `"${form.mediaName}" is in your watchlist. Update it to "Watched"?`,
                        confirmText: "Yes, Update",
                        onConfirm: () => {
                            setModalState({ ...modalState, isOpen: false });
                            updateToWatched(localDuplicate.row_index);
                        }
                    });
                } else {
                    setModalState({
                        isOpen: true, title: "Duplicate Entry",
                        message: `You've already added "${form.mediaName}".`,
                        confirmText: "OK",
                        onConfirm: () => setModalState({ ...modalState, isOpen: false }),
                    });
                }
                setLoading(false);
                return;
            }

            // If no exact local duplicate, proceed to TMDB search for disambiguation
            const searchRes = await axios.get(`${API_BASE}/api/search-tmdb`, {
                params: { mediaType: form.mediaType, name: form.mediaName }
            });
            
            const results = searchRes.data.data;
            if (results.length === 0) {
                setError("No results found on TMDB. Please check the spelling.");
            } else if (results.length === 1) {
                await addMediaById(results[0].id, isWatched);
            } else {
                setDisambiguation({ isOpen: true, results, isWatched });
            }
        } catch (err: any) {
            setError(err.response?.data?.error || "Search failed.");
        } finally {
            setLoading(false);
        }
    };

    const updateToWatched = async (rowIndex: number) => {
        setLoading(true);
        try {
            await axios.put(`${API_BASE}/api/update-media`, {
                rowIndex: rowIndex, mediaType: form.mediaType, watched: 'True',
            });
            setResult({ message: `"${form.mediaName}" updated to "Watched"!` });
            setTimeout(() => setResult(null), 5000);
            await fetchAllMediaData();
            setForm(initialForm);
        } catch (err: any) {
            setError(err.response?.data?.error || "Update failed.");
        } finally {
            setLoading(false);
        }
    };

    const submitMedia = async (mediaType: string, tmdbId: number, watched: string, watchedTill: string) => {
        setLoading(true);
        try {
            const response = await axios.post(`${API_BASE}/api/add-media`, {
                mediaType, tmdbId, watched, watchedTill
            });
            setResult({ message: response.data.message, details: response.data.data });
            setTimeout(() => setResult(null), 5000);
            setForm(initialForm);
            fetchAllMediaData();
        } catch (err: any) {
            setError(err.response?.data?.error || "Failed to add media.");
        } finally {
            setLoading(false);
        }
    };

    const addMediaById = async (tmdbId: number, isWatched: boolean) => {
        setDisambiguation({ isOpen: false, results: [], isWatched: false });
        await submitMedia(
            form.mediaType, 
            tmdbId, 
            isWatched ? 'True' : 'False', 
            `S${String(form.seasonNumber || 1).padStart(2, '0')} E${String(form.episodeNumber || 0).padStart(2, '0')}`
        );
    };

    const [isListening, setIsListening] = useState(false);
    const [liveTranscript, setLiveTranscript] = useState('');
    const finalTranscriptRef = useRef(''); // Tracks final accepted words
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const deepgramLiveRef = useRef<WebSocket | null>(null);

    const toggleListening = async () => {
        if (isListening) {
            setIsListening(false);
            
            // Stop recording
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
                mediaRecorderRef.current.stop();
            }
            if (deepgramLiveRef.current) {
                deepgramLiveRef.current.close();
                deepgramLiveRef.current = null;
            }
            
            const finalText = finalTranscriptRef.current;            
            if (finalText.trim().length > 0) {
                setLoading(true);
                setResult({ message: "Parsing your command..." });
                try {
                    const res = await axios.post(`${API_BASE}/api/voice-nlp`, { transcript: finalText });
                    const parsed = res.data;
                    
                    // Check if it already exists in the user's tracker
                    const existingItem = allMediaData.find(m => 
                        m.series_name?.toLowerCase() === parsed.officialName.toLowerCase() || 
                        m.movies_name?.toLowerCase() === parsed.officialName.toLowerCase() || 
                        m.anime_name?.toLowerCase() === parsed.officialName.toLowerCase()
                    );
                    
                    if (existingItem) {
                        setResult({ message: `Found "${parsed.officialName}". Opening update form...` });
                        setTimeout(() => setResult(null), 5000);
                        setEditingItem({
                            ...existingItem,
                            watched_till: parsed.watchedTill || existingItem.watched_till
                        });
                    } else {
                        setResult({ message: `Found "${parsed.officialName}". Preparing to track...` });
                        setTimeout(() => setResult(null), 5000);
                        setForm({
                            mediaType: parsed.mediaType,
                            mediaName: parsed.officialName,
                            seasonNumber: parsed.watchedTill?.includes('S') ? String(parseInt(parsed.watchedTill.match(/S(\d+)/)?.[1] || "1")) : "1",
                            episodeNumber: parsed.watchedTill?.includes('E') ? String(parseInt(parsed.watchedTill.match(/E(\d+)/)?.[1] || "0")) : "0",
                            watchedTill: parsed.watchedTill || ""
                        });
                        setActiveTab('add');
                    }
                } catch (err: any) {
                    setError(err.response?.data?.error || "Failed to parse voice command.");
                    setTimeout(() => setError(null), 5000);
                    setResult(null);
                } finally {
                    setLoading(false);
                    setLiveTranscript('');
                    finalTranscriptRef.current = '';
                }
            } else {
                setResult(null);
                setLiveTranscript('');
                finalTranscriptRef.current = '';
            }
            return;
        }

        // Start recording
        try {
            const keyRes = await axios.get(`${API_BASE}/api/deepgram-key`);
            const dgKey = keyRes.data.key;
            
            const socket = new WebSocket('wss://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&interim_results=true', ['token', dgKey]);
            deepgramLiveRef.current = socket;
            finalTranscriptRef.current = '';
            
            socket.onopen = async () => {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
                mediaRecorderRef.current = mediaRecorder;

                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0 && socket.readyState === 1) {
                        socket.send(event.data);
                    }
                };

                mediaRecorder.onstart = () => {
                    setIsListening(true);
                    setLiveTranscript('');
                    finalTranscriptRef.current = '';
                    setResult({ message: "Listening... (Click Mic again to stop)" });
                };

                mediaRecorder.onstop = () => {
                    stream.getTracks().forEach(track => track.stop());
                };

                // Send a chunk every 250ms for live streaming
                mediaRecorder.start(250);
            };
            
            socket.onmessage = (message: any) => {
                try {
                    const received = JSON.parse(message.data);
                    if (received.type === "Results") {
                        const transcriptFragment = received.channel.alternatives[0]?.transcript;
                        if (transcriptFragment) {
                            if (received.is_final) {
                                finalTranscriptRef.current = (finalTranscriptRef.current + " " + transcriptFragment).trim();
                                setLiveTranscript(finalTranscriptRef.current);
                            } else {
                                setLiveTranscript((finalTranscriptRef.current + " " + transcriptFragment).trim());
                            }
                        }
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            };
            
            socket.onerror = (err: any) => {
                console.error("Deepgram Error:", err);
                setError("Streaming error. Please try again.");
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
                    mediaRecorderRef.current.stop();
                }
                setIsListening(false);
            };

        } catch (err) {
            console.error(err);
            setError("Could not connect to microphone or transcription service.");
        }
    };
    
    const viewDetails = (item: TMDBResult) => {
        setDetailsItem({ name: item.name, type: form.mediaType });
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement> | MediaType) => {
        if (typeof e === 'string') {
            setSuggestions([]);
            setForm({ ...initialForm, mediaType: e });
        } else {
            const { name, value } = e.target;
            setForm(prev => ({ ...prev, [name]: value }));
            if (name === "mediaName") {
                if (value.length > 1 && form.mediaType) {
                    const nameKey = form.mediaType.includes('movie') ? 'movies_name' : `${form.mediaType}_name`;
                    setSuggestions(allMediaData.filter(item => item.media_type_key === form.mediaType && item[nameKey]?.toLowerCase().includes(value.toLowerCase())));
                } else {
                    setSuggestions([]);
                }
            }
        }
    };

    const handleSuggestionClick = (item: FetchedMediaItem) => {
        const nameKey = item.media_type_key.includes('movie') ? 'movies_name' : `${item.media_type_key}_name`;
        setForm({
            mediaType: item.media_type_key,
            mediaName: item[nameKey] || '',
            seasonNumber: (item.watched_till && !item.media_type_key.includes('movie')) ? item.watched_till.match(/S(\d+)/)?.[1]?.replace(/^0+/, '') || '' : '',
            episodeNumber: (item.watched_till && !item.media_type_key.includes('movie')) ? item.watched_till.match(/E(\d+)/)?.[1]?.replace(/^0+/, '') || '' : '',
            watchedTill: item.watched_till || '',
        });
        setSuggestions([]);
    };

    return (
        <div className="app-container">
            <DotGrid dotSize={2} gap={10} baseColor="#8B5CF6" activeColor="#06B6D4" proximity={80} shockRadius={100} shockStrength={20} resistance={250} returnDuration={0.5} />
            <div className="content-wrapper">
                <div 
                    className="absolute top-6 left-6 z-50 cursor-pointer transition-transform hover:scale-105" 
                    onDoubleClick={() => !isAdmin && setIsLoginModalOpen(true)}
                    title={!isAdmin ? "Double click to login" : "Admin active"}
                >
                    <img 
                        src={theme === 'dark' ? '/logo-horizontal-dark.png' : '/logo-horizontal-light.png'} 
                        alt="Entracker Logo" 
                        style={{ height: '100px', width: 'auto' }}
                    />
                </div>
                <nav className="top-nav" style={{ justifyContent: 'space-between', padding: '1rem 3rem' }}>
                    <div className="nav-links" style={{ gap: '2rem' }}>
                        <button className={`nav-link ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>Home</button>
                        <button className={`nav-link ${activeTab === 'library' ? 'active' : ''}`} onClick={() => setActiveTab('library')}>Library</button>
                        {isAdmin && <button className={`nav-link ${activeTab === 'add' ? 'active' : ''}`} onClick={() => setActiveTab('add')}>Add Media</button>}
                    </div>
                    <div className="nav-links" style={{ gap: '1rem' }}>
                        <button className="nav-link" onClick={toggleTheme} title="Toggle Theme" style={{ display: 'flex', alignItems: 'center' }}>
                            {theme === 'dark' ? (
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                            ) : (
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                            )}
                        </button>
                        {isAdmin && (
                            <button className="nav-link !text-red-400 font-semibold" onClick={handleLogout} title="Logout">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                            </button>
                        )}
                    </div>
                </nav>

                <main className="main-content">
                    <AnimatePresence mode="wait">
                        {activeTab === 'home' && (
                            <motion.div key="home" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
                                <HomeView />
                            </motion.div>
                        )}
                        {activeTab === 'add' && (
                            <motion.div key="add-form" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <form className="add-media-form" onSubmit={(e: FormEvent) => { e.preventDefault(); handleFormSubmit(true); }}>
                                    <div className="input-group">
                                        <label>Category</label>
                                        <select className="premium-select" value={form.mediaType} onChange={(e) => handleChange(e.target.value as MediaType)}>
                                            <option value="" disabled>Select Media Type</option>
                                            {sortedMediaOptions.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                                        </select>
                                    </div>
                                    
                                    <div className="input-group" style={{ flex: 2, position: 'relative' }}>
                                        <label>Title</label>
                                        <input name="mediaName" type="text" value={form.mediaName} onChange={handleChange} placeholder="Search movie or show..." className="premium-input" autoComplete="off" disabled={!form.mediaType} />
                                        <AnimatePresence>
                                            {suggestions.length > 0 && (
                                                <motion.ul className="suggestions-list" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                                                    {suggestions.map((item) => (
                                                        <li key={item.row_index} onClick={() => handleSuggestionClick(item)}>
                                                            {item.series_name || item.movies_name || item.anime_name}
                                                        </li>
                                                    ))}
                                                </motion.ul>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                    
                                    <AnimatePresence>
                                        {(form.mediaType === "series" || form.mediaType === "anime") && (
                                            <motion.div key="series-inputs" className="input-group" style={{ flexDirection: 'row', gap: '1rem', flex: 'none' }} initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }}>
                                                <div className="input-group" style={{ minWidth: '70px' }}>
                                                    <label>Season</label>
                                                    <input name="seasonNumber" type="number" value={form.seasonNumber} onChange={handleChange} placeholder="1" min="1" className="premium-input" required style={{ textAlign: 'center' }} />
                                                </div>
                                                <div className="input-group" style={{ minWidth: '70px' }}>
                                                    <label>Episode</label>
                                                    <input name="episodeNumber" type="number" value={form.episodeNumber} onChange={handleChange} placeholder="0" min="0" className="premium-input" style={{ textAlign: 'center' }} />
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    <div className="input-group" style={{ flex: 'none', flexDirection: 'row', gap: '1rem', alignItems: 'flex-end', width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', gap: '1rem' }}>
                                            <button type="submit" disabled={loading || !form.mediaType || !form.mediaName} className="premium-button">
                                                {loading ? "..." : "Track"}
                                            </button>
                                            <button type="button" onClick={() => handleFormSubmit(false)} disabled={loading || !form.mediaType || !form.mediaName} className="premium-button secondary">
                                                Watchlist
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', width: '100%', maxWidth: '400px' }}>
                                            <AnimatePresence>
                                                {isListening && liveTranscript && (
                                                    <motion.div 
                                                        initial={{ opacity: 0, scale: 0.9, x: -10 }} 
                                                        animate={{ opacity: 1, scale: 1, x: 0 }} 
                                                        exit={{ opacity: 0, scale: 0.9, x: 10 }}
                                                        className="live-transcript-box"
                                                    >
                                                        {liveTranscript}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                            <button type="button" onClick={toggleListening} className={`mic-button ${isListening ? 'listening' : ''}`} title="Use Voice to Add Media" style={{ marginLeft: 'auto' }}>
                                                <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 12,14A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z" /></svg>
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            </motion.div>
                        )}
                        {activeTab === 'library' && (
                            <motion.div key="list-view" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                                <MediaListView isAdmin={isAdmin} onEditClick={(item) => setEditingItem(item)} />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </main>
            </div>
            
            {disambiguation.isOpen && (
                <DisambiguationModal results={disambiguation.results} onSelect={(result) => addMediaById(result.id, disambiguation.isWatched)} onViewDetails={viewDetails} onClose={() => setDisambiguation({ ...disambiguation, isOpen: false })} />
            )}
            {detailsItem && (
                <MediaDetailsModal mediaName={detailsItem.name} mediaType={detailsItem.type} onClose={() => setDetailsItem(null)} />
            )}
            <ConfirmationModal 
                isOpen={modalState.isOpen} title={modalState.title} message={modalState.message}
                onConfirm={modalState.onConfirm} onCancel={() => setModalState({ ...modalState, isOpen: false })} confirmText={modalState.confirmText}
            />
            <LoginModal 
                isOpen={isLoginModalOpen} 
                onClose={() => setIsLoginModalOpen(false)} 
                onLoginSuccess={handleLoginSuccess}
                apiBase={API_BASE}
            />


            <AnimatePresence>
                {error && (
                    <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} style={{ position: 'fixed', bottom: '2rem', right: '2rem', background: 'var(--status-error)', padding: '1rem', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-glass)', zIndex: 100 }}>
                        {error}
                    </motion.div>
                )}
                {result?.message && (
                    <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} style={{ position: 'fixed', bottom: '2rem', right: '2rem', background: 'var(--status-success)', padding: '1rem', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-glass)', zIndex: 100 }}>
                        <strong>{result.message}</strong>
                    </motion.div>
                )}
            </AnimatePresence>

            {editingItem && (
                <EditModal 
                    item={editingItem} 
                    onClose={() => setEditingItem(null)} 
                    onUpdate={() => { setEditingItem(null); fetchAllMediaData(); }} 
                />
            )}
        </div>
    );
}