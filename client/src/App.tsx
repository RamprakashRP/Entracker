/* client/src/App.tsx */
import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import axios from "axios";

// Import the MediaListView component
import MediaListView from './MediaListView';

// Define the Media Types
type MediaType = "series" | "movie" | "anime" | "anime_movie" | "";

// Map media types to user-friendly labels
const mediaLabels: Record<MediaType, string> = {
    series: "TV Series",
    movie: "Movie",
    anime: "Anime Series",
    anime_movie: "Anime Movie",
    '': 'Select Media Type' // Handle empty string case
};

// Convert to an array of [key, label] pairs and sort alphabetically by label
const sortedMediaOptions = Object.entries(mediaLabels)
    .filter(([key]) => key !== '')
    .sort(([, labelA], [, labelB]) => labelA.localeCompare(labelB));

// Define a type for fetched media items from the backend
interface FetchedMediaItem {
    series_name?: string;
    movies_name?: string;
    anime_name?: string;
    row_index: number; // Crucial for updates
    media_type_key: MediaType; // Keep track of the item's original type
    watched_till?: string;
    [key: string]: any; // Allow other properties
}

// Initial state for the form fields
const initialForm = {
    mediaType: "" as MediaType,
    mediaName: "",
    seasonNumber: "",
    episodeNumber: "",
    watchedTill: "",
};

// Custom Dropdown Component
interface MediaDropdownProps {
    options: [string, string][];
    selectedOption: MediaType;
    onSelect: (value: MediaType) => void;
    placeholder: string;
}

const MediaDropdown: React.FC<MediaDropdownProps> = ({ options, selectedOption, onSelect, placeholder }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelect = (value: MediaType) => {
        onSelect(value);
        setIsOpen(false);
    };

    const currentLabel = selectedOption ? mediaLabels[selectedOption] : placeholder;

    return (
        <div className="custom-dropdown-wrapper" ref={dropdownRef}>
            <div className="custom-dropdown-header" onClick={() => setIsOpen(!isOpen)} tabIndex={0} onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setIsOpen(!isOpen);
                }
            }}>
                <span>{currentLabel}</span>
                <svg className={`dropdown-arrow ${isOpen ? "open" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6"></path>
                </svg>
            </div>
            <AnimatePresence>
                {isOpen && (
                    <motion.ul initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="custom-dropdown-list">
                        {options.map(([value, label]) => (
                            <li key={value} className={`custom-dropdown-list-item ${selectedOption === value ? "selected" : ""}`} onClick={() => handleSelect(value as MediaType)}>
                                {label}
                            </li>
                        ))}
                    </motion.ul>
                )}
            </AnimatePresence>
        </div>
    );
};

export default function App() {
    const [form, setForm] = useState(initialForm);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ message: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [currentView, setCurrentView] = useState<'add' | 'list'>('add');
    const [allMediaData, setAllMediaData] = useState<FetchedMediaItem[]>([]);
    const [suggestions, setSuggestions] = useState<FetchedMediaItem[]>([]);
    const [selectedForUpdate, setSelectedForUpdate] = useState<FetchedMediaItem | null>(null);

    const fetchAllMediaData = useCallback(async () => {
        try {
            const types: MediaType[] = ["series", "movie", "anime", "anime_movie"];
            let allData: FetchedMediaItem[] = [];
            for (const type of types) {
                if (!type) continue;
                const response = await axios.get(`http://localhost:5000/get-media/${type}`);
                const typedData = (response.data.data || []).map((item: any) => ({ ...item, media_type_key: type }));
                allData = allData.concat(typedData);
            }
            setAllMediaData(allData);
        } catch (err) {
            console.error("Failed to fetch media data:", err);
        }
    }, []);

    useEffect(() => {
        fetchAllMediaData();
    }, [fetchAllMediaData]);

    const updateNumberInput = (name: 'seasonNumber' | 'episodeNumber', delta: number) => {
        setForm(prev => {
            const currentValue = parseInt(prev[name] || '0', 10);
            let newValue = currentValue + delta;
            if (name === 'seasonNumber' && newValue < 1) newValue = 1;
            if (name === 'episodeNumber' && newValue < 0) newValue = 0;
            return { ...prev, [name]: newValue.toString() };
        });
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement> | MediaType) => {
        if (typeof e === 'string') {
            setSelectedForUpdate(null);
            setSuggestions([]);
            setForm({ ...initialForm, mediaType: e });
        } else {
            const { name, value } = e.target;
            setForm(prev => ({ ...prev, [name]: value }));
            if (name === "mediaName") {
                setSelectedForUpdate(null);
                if (value.length > 1 && form.mediaType) {
                    const filteredSuggestions = allMediaData.filter(item =>
                        item.media_type_key === form.mediaType &&
                        (item.series_name || item.movies_name || item.anime_name || '').toLowerCase().includes(value.toLowerCase())
                    );
                    setSuggestions(filteredSuggestions);
                } else {
                    setSuggestions([]);
                }
            }
        }
    };

    const handleSuggestionClick = (item: FetchedMediaItem) => {
        setForm({
            mediaType: item.media_type_key as MediaType,
            mediaName: (item.series_name || item.movies_name || item.anime_name || '') as string,
            seasonNumber: (item.watched_till && (item.media_type_key === 'series' || item.media_type_key === 'anime')
                ? item.watched_till.match(/S(\d+)/)?.[1]?.replace(/^0+/, '') || '' : '') as string,
            episodeNumber: (item.watched_till && (item.media_type_key === 'series' || item.media_type_key === 'anime')
                ? item.watched_till.match(/E(\d+)/)?.[1]?.replace(/^0+/, '') || '' : '') as string,
            watchedTill: (item.watched_till && (item.media_type_key === 'movie' || item.media_type_key === 'anime_movie')
                ? item.watched_till : '') as string,
        });
        setSelectedForUpdate(item);
        setSuggestions([]);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setResult(null);
        setError(null);

        if (!form.mediaType || !form.mediaName) {
            setError("Please select a media type and enter a name.");
            setLoading(false);
            return;
        }

        let watchedTillForBackend = "";
        if (form.mediaType === "series" || form.mediaType === "anime") {
            const sNum = parseInt(form.seasonNumber, 10);
            if (!form.seasonNumber || isNaN(sNum) || sNum <= 0) {
                setError("Season number must be a positive number.");
                setLoading(false); return;
            }
            const eNum = parseInt(form.episodeNumber, 10);
            watchedTillForBackend = `S${String(sNum).padStart(2, '0')}`;
            if (form.episodeNumber && !isNaN(eNum) && eNum >= 0) {
                watchedTillForBackend += ` E${String(eNum).padStart(2, '0')}`;
            }
        }

        try {
            const requestData = {
                mediaType: form.mediaType,
                mediaName: form.mediaName,
                watchedTill: watchedTillForBackend,
                rowIndex: selectedForUpdate ? selectedForUpdate.row_index : undefined,
            };
            await (selectedForUpdate ? axios.put : axios.post)("http://localhost:5000/add-media", requestData);

            setResult({ message: selectedForUpdate ? "Update Successful!" : "Media Added Successfully!" });
            setForm(initialForm);
            setSelectedForUpdate(null);
            setSuggestions([]);
            fetchAllMediaData();
        } catch (err: any) {
            setError(err.response?.data?.error || "Something went wrong.");
        } finally {
            setLoading(false);
        }
    };

    const handleTabClick = (view: 'add' | 'list') => {
        setCurrentView(view);
        setResult(null);
        setError(null);
        if (view === 'add') {
            setForm(initialForm);
            setSelectedForUpdate(null);
            setSuggestions([]);
        }
    };

    return (
        <div className="main-app-wrapper">
            <img src="/RP.png" alt="RP Logo" className="app-logo" />
            <motion.div 
                initial={{ opacity: 0, y: 20 }} 
                animate={{ opacity: 1, y: 0 }}
                className={`glass-card-container ${currentView === 'list' ? 'list-view-active' : ''}`}
            >
                <div className="tab-navigation">
                    <button className={`tab-button ${currentView === 'add' ? 'active' : ''}`} onClick={() => handleTabClick('add')}>Add Media</button>
                    <button className={`tab-button ${currentView === 'list' ? 'active' : ''}`} onClick={() => handleTabClick('list')}>View List</button>
                </div>

                <h1 className="app-title">Entracker</h1>

                <AnimatePresence mode="wait">
                    {currentView === 'add' ? (
                        <motion.div key="add-form" exit={{ opacity: 0 }}>
                            <form onSubmit={handleSubmit} className="form-layout">
                                <div className="form-first-row">
                                    <MediaDropdown options={sortedMediaOptions as [string, string][]} selectedOption={form.mediaType} onSelect={(v) => handleChange(v)} placeholder="Select Media Type" />
                                    <div className="input-with-suggestions-container">
                                        <input name="mediaName" type="text" value={form.mediaName} onChange={handleChange} placeholder="Enter name" className="form-input" autoComplete="off" disabled={!form.mediaType} />
                                        <AnimatePresence>
                                            {suggestions.length > 0 && (
                                                <motion.ul initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="suggestions-list">
                                                    {suggestions.map((item) => (
                                                        <li key={item.row_index} onClick={() => handleSuggestionClick(item)}>
                                                            {item.series_name || item.movies_name || item.anime_name}
                                                        </li>
                                                    ))}
                                                </motion.ul>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>
                                <div className="conditional-input-row">
                                    <AnimatePresence>
                                        {(form.mediaType === "series" || form.mediaType === "anime") && (
                                            <motion.div key="series-inputs" className="watched-till-group" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                                                <label htmlFor="seasonNumber">Season:</label>
                                                <div className="watched-till-input-container">
                                                    <button type="button" className="spin-button" onClick={() => updateNumberInput('seasonNumber', -1)} disabled={parseInt(form.seasonNumber || '1', 10) <= 1}>-</button>
                                                    <input id="seasonNumber" name="seasonNumber" type="number" value={form.seasonNumber} onChange={handleChange} placeholder="1" min="1" className="watched-till-input-short" required />
                                                    <button type="button" className="spin-button" onClick={() => updateNumberInput('seasonNumber', 1)}>+</button>
                                                </div>
                                                <label htmlFor="episodeNumber">Episode:</label>
                                                <div className="watched-till-input-container">
                                                    <button type="button" className="spin-button" onClick={() => updateNumberInput('episodeNumber', -1)} disabled={parseInt(form.episodeNumber || '0', 10) <= 0}>-</button>
                                                    <input id="episodeNumber" name="episodeNumber" type="number" value={form.episodeNumber} onChange={handleChange} placeholder="0" min="0" className="watched-till-input-short" />
                                                    <button type="button" className="spin-button" onClick={() => updateNumberInput('episodeNumber', 1)}>+</button>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }} disabled={loading || !form.mediaType || !form.mediaName} className="submit-button">
                                    {loading ? "Processing..." : (selectedForUpdate ? "Update Tracker" : "Add to Tracker")}
                                </motion.button>
                            </form>
                        </motion.div>
                    ) : (
                        <motion.div key="list-view">
                            <MediaListView />
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {error && <motion.div className="message-box error" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><p>{error}</p></motion.div>}
                    {result?.message && (
                        <motion.div className="message-box success" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                            <h2>{result.message}</h2>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    );
}