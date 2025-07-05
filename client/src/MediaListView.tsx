/* client/src/MediaListView.tsx */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { EditModal } from './EditModal'; // Import the new modal component

type ListMediaType = "series" | "movie" | "anime" | "anime_movie";

const listViewLabels: Record<ListMediaType, string> = {
    series: "TV Series",
    movie: "Movie",
    anime: "Anime Series",
    anime_movie: "Anime Movie",
};

interface FetchedMediaItem {
    series_name?: string;
    movies_name?: string;
    anime_name?: string;
    row_index: number;
    series_status?: string;
    season_status?: string;
    franchise_status?: string;
    watched_till?: string;
    next_season?: string;
    next_part?: string;
    expected_on?: string;
    update?: string;
    media_type_key: ListMediaType;
    [key: string]: any;
}

const MediaListView: React.FC = () => {
    const [selectedListType, setSelectedListType] = useState<ListMediaType>('series');
    const [mediaList, setMediaList] = useState<FetchedMediaItem[]>([]);
    const [loadingList, setLoadingList] = useState(false);
    const [listError, setListError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [searchSuggestions, setSearchSuggestions] = useState<FetchedMediaItem[]>([]);
    const searchContainerRef = useRef<HTMLDivElement>(null);
    
    const [editingItem, setEditingItem] = useState<FetchedMediaItem | null>(null);

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
            const typedData = (response.data.data || []).map((item: any) => ({ ...item, media_type_key: mediaType }));
            setMediaList(typedData);
        } catch (err: any) {
            setListError(err.response?.data?.error || "Failed to load list.");
        } finally {
            setLoadingList(false);
        }
    };

    useEffect(() => {
        fetchMediaList(selectedListType);
    }, [selectedListType]);

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearchTerm(value);
        if (value.length > 0 && mediaList.length > 0) {
            const filtered = mediaList.filter(item => {
                const name = item.series_name || item.movies_name || item.anime_name || '';
                return name.toLowerCase().includes(value.toLowerCase());
            });
            setSearchSuggestions(filtered);
        } else {
            setSearchSuggestions([]);
        }
    };
    
    const handleSuggestionClick = (item: FetchedMediaItem) => {
        const itemName = item.series_name || item.movies_name || item.anime_name || '';
        setSearchTerm(itemName);
        setSearchSuggestions([]);
    };

    const filteredTableData = useMemo(() => {
        if (!searchTerm) return mediaList;
        return mediaList.filter(item => {
            const name = item.series_name || item.movies_name || item.anime_name || '';
            return name.toLowerCase().includes(searchTerm.toLowerCase());
        });
    }, [mediaList, searchTerm]);
    
    const headers = selectedListType === 'series' || selectedListType === 'anime'
        ? ["Name", "Series Status", "Watched Till", "Next Season", "Updated", "Actions"]
        : ["Name", "Franchise Status", "Watched Till", "Next Part", "Updated", "Actions"];

    return (
        <>
            <motion.div className="media-list-view-container" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
                <div className="list-controls">
                    <div className="list-filter-container">
                        {Object.entries(listViewLabels).map(([key, label]) => (
                            <button key={key} className={`list-filter-button ${selectedListType === key ? 'active' : ''}`} onClick={() => setSelectedListType(key as ListMediaType)} disabled={loadingList}>
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="search-bar-container" ref={searchContainerRef}>
                        <input
                            type="text"
                            placeholder={`Search in ${listViewLabels[selectedListType]}...`}
                            className="search-input"
                            value={searchTerm}
                            onChange={handleSearchChange}
                            disabled={loadingList || mediaList.length === 0}
                        />
                        <svg className="search-icon" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        <AnimatePresence>
                            {searchSuggestions.length > 0 && (
                                <motion.ul className="search-suggestions-list" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                                    {searchSuggestions.slice(0, 5).map(item => (
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
                                        <motion.tr key={item.row_index} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                            {selectedListType === 'series' || selectedListType === 'anime' ? (
                                                <>
                                                    <td>{item.series_name || item.anime_name}</td>
                                                    <td>{item.series_status || 'N/A'}</td>
                                                    <td>{item.watched_till || 'N/A'}</td>
                                                    <td>{item.next_season || 'N/A'}</td>
                                                    <td>{item.update ? new Date(item.update).toLocaleDateString() : 'N/A'}</td>
                                                </>
                                            ) : (
                                                <>
                                                    <td>{item.movies_name}</td>
                                                    <td>{item.franchise_status || 'N/A'}</td>
                                                    <td>{item.watched_till || 'N/A'}</td>
                                                    <td>{item.next_part || 'N/A'}</td>
                                                    <td>{item.update ? new Date(item.update).toLocaleDateString() : 'N/A'}</td>
                                                </>
                                            )}
                                            <td>
                                                <button className="edit-button" onClick={() => setEditingItem(item)}>
                                                    <svg viewBox="0 0 24 24"><path fill="currentColor" d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.13,5.12L18.88,8.87M3,17.25V21H6.75L17.81,9.94L14.06,6.19L3,17.25Z" /></svg>
                                                </button>
                                            </td>
                                        </motion.tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
            
            <AnimatePresence>
                {editingItem && (
                    <EditModal 
                        item={editingItem} 
                        onClose={() => setEditingItem(null)} 
                        onUpdate={() => {
                            setEditingItem(null);
                            fetchMediaList(selectedListType); // Refresh list after successful update
                        }}
                    />
                )}
            </AnimatePresence>
        </>
    );
};

export default MediaListView;