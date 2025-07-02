/* client/src/App.tsx */
import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import axios from "axios";

// Import the new MediaListView component (will create in the next step)
import MediaListView from './MediaListView';

// Define the Media Types
type MediaType = "series" | "movie" | "anime" | "anime_movie" | "";

// Map media types to user-friendly labels
const mediaLabels: Record<MediaType, string> = {
  series: "TV Series",
  movie: "Movie",
  anime: "Anime Series",
  anime_movie: "Anime Movie",
};

// Convert to an array of [key, label] pairs and sort alphabetically by label
const sortedMediaOptions = Object.entries(mediaLabels).sort(([, labelA], [, labelB]) =>
  labelA.localeCompare(labelB)
);

// Define a type for fetched media items from the backend
interface FetchedMediaItem {
    series_name?: string;
    movies_name?: string;
    anime_name?: string;
    row_index: number; // Crucial for updates
    [key: string]: any; // Allow other properties
}

// Initial state for the form fields
const initialForm = {
  mediaType: "" as MediaType,
  mediaName: "",
  seasonNumber: "",
  episodeNumber: "",
  watchedTill: "", // Only used for movie/anime_movie
};

// Custom Dropdown Component
interface MediaDropdownProps {
  options: [MediaType, string][];
  selectedOption: MediaType;
  onSelect: (value: MediaType) => void;
  placeholder: string;
}

const MediaDropdown: React.FC<MediaDropdownProps> = ({
  options,
  selectedOption,
  onSelect,
  placeholder,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSelect = (value: MediaType) => {
    onSelect(value);
    setIsOpen(false);
  };

  const currentLabel = selectedOption ? options.find(([value]) => value === selectedOption)?.[1] || selectedOption : placeholder;

  return (
    <div className="custom-dropdown-wrapper" ref={dropdownRef}>
      <div
        className="custom-dropdown-header"
        onClick={() => setIsOpen(!isOpen)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
      >
        <span>{currentLabel}</span>
        <svg
          className={`dropdown-arrow ${isOpen ? "open" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6"></path>
        </svg>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.ul
            initial={{ opacity: 0, y: -10, scaleY: 0.95 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: -10, scaleY: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="custom-dropdown-list"
            style={{ originY: "top" }}
          >
            {options.map(([value, label]) => (
              <li
                key={value}
                className={`custom-dropdown-list-item ${
                  selectedOption === value ? "selected" : ""
                }`}
                onClick={() => handleSelect(value)}
              >
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
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'add' | 'list'>('add');

  // NEW STATE for suggestions and update
  const [allMediaData, setAllMediaData] = useState<FetchedMediaItem[]>([]); // All fetched data
  const [suggestions, setSuggestions] = useState<FetchedMediaItem[]>([]); // Filtered suggestions
  const [selectedForUpdate, setSelectedForUpdate] = useState<FetchedMediaItem | null>(null); // Holds selected item for update

  // Helper to fetch all media data
  const fetchAllMediaData = useCallback(async () => {
    try {
        const types: MediaType[] = ["series", "movie", "anime", "anime_movie"];
        let allData: FetchedMediaItem[] = [];
        for (const type of types) {
            const response = await axios.get(`http://localhost:5000/get-media/${type}`);
            const typedData = response.data.data.map((item: any) => ({
                ...item,
                media_type_key: type // Add a key to identify original media type for suggestions
            }));
            allData = allData.concat(typedData);
        }
        setAllMediaData(allData);
        console.log("Fetched all media data for suggestions:", allData);
    } catch (err) {
        console.error("Failed to fetch all media data for suggestions:", err);
    }
  }, []);

  // Fetch data on component mount
  useEffect(() => {
    fetchAllMediaData();
  }, [fetchAllMediaData]);


  // Helper function to update number inputs safely
  const updateNumberInput = (name: 'seasonNumber' | 'episodeNumber', delta: number) => {
    setForm(prev => {
      const currentValue = parseInt(prev[name] || '0', 10);
      let newValue = currentValue + delta;
      
      // Ensure season number is always at least 1
      if (name === 'seasonNumber' && newValue < 1) newValue = 1;
      // Ensure episode number is non-negative
      if (name === 'episodeNumber' && newValue < 0) newValue = 0;

      return {
        ...prev,
        [name]: newValue.toString(),
      };
    });
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement> | MediaType
  ) => {
    if (typeof e === 'string') { // Custom dropdown selection (mediaType)
      console.log(`Media Type changed from: ${form.mediaType} to: ${e}`);
      setSelectedForUpdate(null); // Reset update selection on media type change
      setSuggestions([]); // Clear suggestions
      setForm(prev => ({ 
        ...prev, 
        mediaType: e,
        mediaName: "", // Clear media name when type changes
        seasonNumber: "",
        episodeNumber: "",
        watchedTill: ""
      }));
    } else { // Regular input change (mediaName, seasonNumber, episodeNumber, watchedTill)
      const { name, value } = e.target;
      console.log(`Input changed: ${name}, Value: ${value}`);

      if (name === "mediaName") {
        setSelectedForUpdate(null); // Clear update selection if user types
        if (value.length > 1) { // Show suggestions after 1 character
            const filteredSuggestions = allMediaData.filter(item => {
                const itemName = item.series_name || item.movies_name || item.anime_name || '';
                return itemName.toLowerCase().includes(value.toLowerCase()) && 
                       (form.mediaType === '' || item.media_type_key === form.mediaType); // Filter by selected media type too
            });
            setSuggestions(filteredSuggestions);
        } else {
            setSuggestions([]);
        }
      }

      if ((name === "seasonNumber" || name === "episodeNumber")) {
        if (value === '' || /^\d+$/.test(value)) {
          setForm(prev => ({ ...prev, [name]: value }));
        }
      } else {
        setForm(prev => ({ ...prev, [name]: value }));
      }
    }
  };

  const handleSuggestionClick = (item: FetchedMediaItem) => {
    // Populate form with selected suggestion data for update
    setForm({
        mediaType: item.media_type_key as MediaType,
        mediaName: (item.series_name || item.movies_name || item.anime_name || '') as string,
        seasonNumber: (item.watched_till && (item.media_type_key === 'series' || item.media_type_key === 'anime') 
                       ? item.watched_till.match(/S(\d+)/)?.[1] || '' : '') as string,
        episodeNumber: (item.watched_till && (item.media_type_key === 'series' || item.media_type_key === 'anime')
                        ? item.watched_till.match(/E(\d+)/)?.[1] || '' : '') as string,
        watchedTill: (item.watched_till && (item.media_type_key === 'movie' || item.media_type_key === 'anime_movie') 
                      ? item.watched_till : '') as string,
    });
    setSelectedForUpdate(item); // Set this item as the one to update
    setSuggestions([]); // Clear suggestions after selection
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);

    console.log("Submitting form with data:", form);

    if (!form.mediaType) {
        setError("Please select a media type.");
        setLoading(false);
        return;
    }
    if (!form.mediaName) {
      setError("Please enter a media name.");
      setLoading(false);
      return;
    }


    let watchedTillForBackend: string = "";

    console.log("Current mediaType for conditional logic:", form.mediaType);

    if (form.mediaType === "series" || form.mediaType === "anime") {
        console.log("Entering series/anime logic block.");
        const sNum = parseInt(form.seasonNumber, 10);
        const eNum = parseInt(form.episodeNumber, 10);

        if (form.seasonNumber === "") {
          setError("Season number is required for series/anime.");
          setLoading(false);
          return;
        }
        if (isNaN(sNum) || sNum <= 0) {
            setError("Season number must be a positive number.");
            setLoading(false);
            return;
        }

        let seasonPart = `S${sNum.toString().padStart(2, '0')}`;

        if (form.episodeNumber !== "") {
            if (isNaN(eNum) || eNum < 0) {
                setError("Episode number must be a non-negative number.");
                setLoading(false);
                return;
            }
            let episodePart = `E${eNum.toString().padStart(2, '0')}`;
            watchedTillForBackend = `${seasonPart} ${episodePart}`;
        } else {
            watchedTillForBackend = seasonPart;
        }
    } else { // This else block handles 'movie' and 'anime_movie' AND the initial empty state
        console.log("Entering movie/default logic block.");
        watchedTillForBackend = ""; // Send empty string for backend to determine
    }

    try {
      const requestData = {
        mediaType: form.mediaType,
        mediaName: form.mediaName,
        watchedTill: watchedTillForBackend,
        rowIndex: selectedForUpdate ? selectedForUpdate.row_index : undefined // Include rowIndex for update
      };

      const res = await (selectedForUpdate ? axios.put : axios.post)("http://localhost:5000/add-media", requestData); // Call PUT if updating, POST if adding
      
      setResult(res.data.data);
      setForm(initialForm);
      setSelectedForUpdate(null); // Clear update selection
      setSuggestions([]); // Clear suggestions
      fetchAllMediaData(); // Refresh all data after add/update
    } catch (err: any) {
      setError(err.response?.data?.error || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="main-app-wrapper"
    >
      <div className="glass-card-container">
        {/* Navigation Tabs */}
        <div className="tab-navigation">
          <button 
            className={`tab-button ${currentView === 'add' ? 'active' : ''}`}
            onClick={() => { setCurrentView('add'); setResult(null); setError(null); setForm(initialForm); setSelectedForUpdate(null); setSuggestions([]); }}
          >
            Add Media
          </button>
          <button 
            className={`tab-button ${currentView === 'list' ? 'active' : ''}`}
            onClick={() => { setCurrentView('list'); setResult(null); setError(null); }}
          >
            View List
          </button>
        </div>

        <h1 className="app-title">Entracker</h1>

        {currentView === 'add' ? (
          <form onSubmit={handleSubmit} className="form-layout">
            <div className="form-first-row-wrapper"> {/* NEW WRAPPER for positioning */}
              <div className="form-first-row">
                <MediaDropdown
                  options={sortedMediaOptions}
                  selectedOption={form.mediaType}
                  onSelect={(value) => handleChange(value)}
                  placeholder="Select Media Type"
                />

                <div className="input-with-suggestions-container"> {/* NEW CONTAINER for input and suggestions */}
                  <input
                    name="mediaName"
                    type="text"
                    value={form.mediaName}
                    onChange={handleChange}
                    placeholder="Enter name"
                    className="form-input"
                    autoComplete="off" // Disable browser autocomplete
                  />
                  <AnimatePresence>
                    {suggestions.length > 0 && form.mediaName.length > 1 && (
                      <motion.ul 
                        initial={{ opacity: 0, y: -10, scaleY: 0.95 }}
                        animate={{ opacity: 1, y: 0, scaleY: 1 }}
                        exit={{ opacity: 0, y: -10, scaleY: 0.95 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="suggestions-list"
                        style={{ originY: "top" }}
                      >
                        {suggestions.map((item) => (
                          <li key={item.row_index} onClick={() => handleSuggestionClick(item)}>
                            {item.series_name || item.movies_name || item.anime_name} ({mediaLabels[item.media_type_key as MediaType]})
                          </li>
                        ))}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </div>
              </div> {/* End form-first-row */}
            </div> {/* End form-first-row-wrapper */}

            <div className="conditional-input-row">
              {(form.mediaType === "series" || form.mediaType === "anime") ? (
                <div className="watched-till-group" key="series-anime-inputs">
                  <span className="watched-till-group-label">Watched till:</span>
                  
                  <label htmlFor="seasonNumber">Season:</label>
                  <div className="watched-till-input-container">
                    <button
                      type="button"
                      className="spin-button"
                      onClick={() => updateNumberInput('seasonNumber', -1)}
                      disabled={parseInt(form.seasonNumber || '0', 10) <= 1}
                    >
                      -
                    </button>
                    <input
                      id="seasonNumber"
                      name="seasonNumber"
                      type="number"
                      value={form.seasonNumber}
                      onChange={handleChange}
                      placeholder="01"
                      min="1"
                      className="watched-till-input-short"
                      required
                    />
                    <button
                      type="button"
                      className="spin-button"
                      onClick={() => updateNumberInput('seasonNumber', 1)}
                    >
                      +
                    </button>
                  </div>

                  <label htmlFor="episodeNumber">Episode:</label>
                  <div className="watched-till-input-container">
                    <button
                      type="button"
                      className="spin-button"
                      onClick={() => updateNumberInput('episodeNumber', -1)}
                      disabled={parseInt(form.episodeNumber || '0', 10) <= 0}
                    >
                      -
                    </button>
                    <input
                      id="episodeNumber"
                      name="episodeNumber"
                      type="number"
                      value={form.episodeNumber}
                      onChange={handleChange}
                      placeholder="01"
                      min="0"
                      className="watched-till-input-short"
                    />
                    <button
                      type="button"
                      className="spin-button"
                      onClick={() => updateNumberInput('episodeNumber', 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              ) : (
                <div key="movie-default-placeholder"></div>
              )}
            </div>

            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
              disabled={loading || !form.mediaType || !form.mediaName}
              className="submit-button"
            >
              {loading ? "Processing..." : (selectedForUpdate ? "Update Tracker" : "Add to Tracker")}
            </motion.button>
          </form>
        ) : (
          <MediaListView />
        )}

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="message-box error"
            >
              <p className="font-weight-medium">Error:</p>
              <p>{error}</p>
            </motion.div>
          )}

          {result && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="message-box success"
            >
              <h2>Media Added Successfully!</h2>
              <div className="result-grid">
                {Object.entries(result).map(([key, value]) => (
                  <div key={key}>
                    <p className="result-label">{key.replace(/_/g, " ")}:</p>
                    <p className="result-value">{String(value)}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}