/* client/src/MediaListView.tsx */
import React, { useState, useEffect, useMemo, useRef } from 'react'; // Import useRef
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { FranchiseModal } from './FranchiseModal';
import { MediaDetailsModal } from './MediaDetailsModal';

type ListMediaType = "series" | "movie" | "anime" | "anime_movie";

const listViewLabels: Record<ListMediaType, string> = {
    series: "TV Series",
    movie: "Movie",
    anime: "Anime Series",
    anime_movie: "Anime Movie",
};

interface MediaItem {
    row_index: number;
    [key: string]: any;
}

const MediaListView: React.FC = () => {
    const [selectedListType, setSelectedListType] = useState<ListMediaType>('series');
    const [mediaList, setMediaList] = useState<MediaItem[]>([]);
    const [loadingList, setLoadingList] = useState(false);
    const [listError, setListError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [detailsItem, setDetailsItem] = useState<MediaItem | null>(null);
    
    // --- CHANGE 2a: Add state and refs for search suggestions ---
    const [searchSuggestions, setSearchSuggestions] = useState<MediaItem[]>([]);
    const searchContainerRef = useRef<HTMLDivElement>(null);
    
    const [selectedFranchise, setSelectedFranchise] = useState<string | null>(null);

    // --- Add useEffect to handle clicks outside the search suggestions ---
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
                setSearchSuggestions([]);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const fetchMediaList = async (mediaType: ListMediaType) => {
        setLoadingList(true);
        setListError(null);
        setMediaList([]);
        setSearchTerm("");
        try {
            const response = await axios.get(`http://localhost:5000/get-media/${mediaType}`);
            setMediaList(response.data.data || []);
        } catch (err: any) {
            setListError(err.response?.data?.error || "Failed to load list.");
        } finally {
            setLoadingList(false);
        }
    };

    useEffect(() => {
        fetchMediaList(selectedListType);
    }, [selectedListType]);
    
    // --- CHANGE 2b: Add logic to handle search and suggestion filtering ---
    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearchTerm(value);

        if (value.length > 0 && mediaList.length > 0) {
            const nameKey = selectedListType.includes('movie') ? 'movies_name' : (selectedListType === 'series' ? 'series_name' : 'anime_name');
            const filtered = mediaList.filter(item => 
                item[nameKey]?.toLowerCase().includes(value.toLowerCase())
            );
            setSearchSuggestions(filtered.slice(0, 5)); // Show top 5 suggestions
        } else {
            setSearchSuggestions([]);
        }
    };
    
    const handleSuggestionClick = (item: MediaItem) => {
        const nameKey = selectedListType.includes('movie') ? 'movies_name' : (selectedListType === 'series' ? 'series_name' : 'anime_name');
        setSearchTerm(item[nameKey] || '');
        setSearchSuggestions([]);
    };

    const filteredTableData = useMemo(() => {
        if (!searchTerm) return mediaList;
        return mediaList.filter(item => {
            const name = item.series_name || item.movies_name || item.anime_name || '';
            return name.toLowerCase().includes(searchTerm.toLowerCase());
        });
    }, [mediaList, searchTerm]);

    const handleFranchiseClick = (franchiseName: string) => {
        if (franchiseName && franchiseName.toLowerCase() !== 'standalone') {
            setSelectedFranchise(franchiseName);
        }
    };

    const headers = useMemo(() => {
        if (selectedListType === 'movie' || selectedListType === 'anime_movie') {
            return ["Name", "Franchise", "Watched Till", "Next Part", "Expected On", "Updated"];
        }
        return ["Name", "Series Status", "Watched Till", "Next Season", "Expected On", "Updated"];
    }, [selectedListType]);

    return (
        <>
            <motion.div className="media-list-view-container" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="list-controls">
                    <div className="list-filter-container">
                        {Object.entries(listViewLabels).map(([key, label]) => (
                            <button key={key} className={`list-filter-button ${selectedListType === key ? 'active' : ''}`} onClick={() => setSelectedListType(key as ListMediaType)} disabled={loadingList}>
                                {label}
                            </button>
                        ))}
                    </div>
                     {/* --- CHANGE 2c: Wrap search input in container with the ref --- */}
                    <div className="search-bar-container" ref={searchContainerRef}>
                        <input
                            type="text"
                            placeholder={`Search in ${listViewLabels[selectedListType]}...`}
                            className="search-input"
                            value={searchTerm}
                            onChange={handleSearchChange}
                            disabled={loadingList || mediaList.length === 0}
                            autoComplete="off"
                        />
                        <svg className="search-icon" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        
                        {/* --- Render the search suggestions list --- */}
                        <AnimatePresence>
                            {searchSuggestions.length > 0 && (
                                <motion.ul initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="suggestions-list">
                                    {searchSuggestions.map((item) => (
                                        <li key={item.row_index} onClick={() => handleSuggestionClick(item)}>
                                            {item.series_name || item.movies_name || item.anime_name}
                                        </li>
                                    ))}
                                </motion.ul>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                <div className="table-container">
                    <AnimatePresence mode="wait">
                        {loadingList ? (
                            <motion.div key="loader" className="loading-state">Loading...</motion.div>
                        ) : listError ? (
                            <motion.div key="error" className="error-state">{listError}</motion.div>
                        ) : (
                            <table className="media-table">
                                <thead>
                                    <tr>{headers.map(h => <th key={h}>{h}</th>)}</tr>
                                </thead>
                                <tbody>
                                    {filteredTableData.map((item) => (
                                        <motion.tr key={item.row_index} layout>
                                            {selectedListType === 'series' || selectedListType === 'anime' ? (
                                                <>
                                                    <td className={`name-link ${item.watched?.toLowerCase() === 'true' ? 'watched-true' : 'watched-false'}`} onClick={() => setDetailsItem(item)}>
                                                        {item.series_name || item.anime_name}
                                                    </td>
                                                    <td>{item.series_status || 'N/A'}</td>
                                                    <td>{item.watched_till || 'N/A'}</td>
                                                    <td>{item.next_season || 'N/A'}</td>
                                                    <td>{item.expected_on || 'N/A'}</td>
                                                    <td>{item.update ? new Date(item.update).toLocaleDateString() : 'N/A'}</td>
                                                </>
                                            ) : (
                                                <>
                                                     {/* --- CHANGE 1a: Add title attribute for hover tooltip --- */}
                                                    <td className={`name-link ${item.watched?.toLowerCase() === 'true' ? 'watched-true' : 'watched-false'}`} onClick={() => setDetailsItem(item)}>
                                                        {item.movies_name}
                                                    </td>
                                                    <td
                                                        className={item.franchise && item.franchise.toLowerCase() !== 'standalone' ? 'franchise-link' : ''}
                                                        onClick={() => handleFranchiseClick(item.franchise)}
                                                    >
                                                        {item.franchise || 'N/A'}
                                                    </td>
                                                    <td>{item.watched_till || 'N/A'}</td>
                                                    <td>{item.next_part || 'N/A'}</td>
                                                    <td>{item.expected_on || 'N/A'}</td>
                                                    <td>{item.update ? new Date(item.update).toLocaleDateString() : 'N/A'}</td>
                                                </>
                                            )}
                                        </motion.tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>

            {selectedFranchise && (
                <FranchiseModal
                    franchiseName={selectedFranchise}
                    mediaType={selectedListType as 'movie' | 'anime_movie'}
                    onClose={() => setSelectedFranchise(null)}
                />
            )}

            {detailsItem && (
                <MediaDetailsModal
                    mediaName={detailsItem.series_name || detailsItem.movies_name || detailsItem.anime_name}
                    mediaType={selectedListType}
                    onClose={() => setDetailsItem(null)}
                />
            )}
        </>
    );
};

export default MediaListView;