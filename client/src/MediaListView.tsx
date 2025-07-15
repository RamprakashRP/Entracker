/* client/src/MediaListView.tsx */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { FranchiseModal, type FranchiseMovieItem } from './FranchiseModal';
import { MediaDetailsModal } from './MediaDetailsModal';
import { EditModal } from './EditModal';

type ListMediaType = "series" | "movie" | "anime" | "anime_movie";

const listViewLabels: Record<ListMediaType, string> = {
    series: "TV Series", movie: "Movie", anime: "Anime Series", anime_movie: "Anime Movie",
};

interface MediaItem {
    row_index: number;
    media_type_key: ListMediaType;
    [key: string]: any;
}

const MediaListView: React.FC = () => {
    const API_URL = import.meta.env.VITE_API_BASE_URL;
    const [selectedListType, setSelectedListType] = useState<ListMediaType>('series');
    const [mediaList, setMediaList] = useState<MediaItem[]>([]);
    const [loadingList, setLoadingList] = useState(false);
    const [listError, setListError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [searchSuggestions, setSearchSuggestions] = useState<MediaItem[]>([]);
    const searchContainerRef = useRef<HTMLDivElement>(null);
    
    const [selectedFranchise, setSelectedFranchise] = useState<string | null>(null);
    const [detailsItem, setDetailsItem] = useState<MediaItem | null>(null);
    const [editingItem, setEditingItem] = useState<MediaItem | null>(null);
    const [cameFromFranchise, setCameFromFranchise] = useState<string | null>(null);

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
            const response = await axios.get(`${API_URL}/get-media/${mediaType}`);
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
            const nameKey = selectedListType.includes('movie') ? 'movies_name' : `${selectedListType}_name`;
            setSearchSuggestions(mediaList.filter(item => item[nameKey]?.toLowerCase().includes(value.toLowerCase())).slice(0, 5));
        } else {
            setSearchSuggestions([]);
        }
    };
    
    const handleSuggestionClick = (item: MediaItem) => {
        const nameKey = selectedListType.includes('movie') ? 'movies_name' : `${selectedListType}_name`;
        setSearchTerm(item[nameKey] || '');
        setSearchSuggestions([]);
    };

    const filteredTableData = useMemo(() => {
        if (!searchTerm) return mediaList;
        const nameKey = selectedListType.includes('movie') ? 'movies_name' : (selectedListType === 'series' ? 'series_name' : 'anime_name');
        return mediaList.filter(item => item[nameKey]?.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [mediaList, searchTerm, selectedListType]);

    const handleFranchiseClick = (franchiseName: string) => {
        if (franchiseName && franchiseName.toLowerCase() !== 'standalone') {
            setSelectedFranchise(franchiseName);
        }
    };

    const handleMovieSelectFromModal = (movie: FranchiseMovieItem) => {
        setCameFromFranchise(selectedFranchise);
        setSelectedFranchise(null);
        setTimeout(() => { setDetailsItem(movie); }, 150);
    };

    const handleDetailsClose = () => {
        setDetailsItem(null);
        if (cameFromFranchise) { setSelectedFranchise(cameFromFranchise); }
        setCameFromFranchise(null);
    };

    const handleUpdate = () => {
        setEditingItem(null);
        fetchMediaList(selectedListType);
    };

    const headers = useMemo(() => {
        let baseHeaders = ["Name"];
        if (selectedListType === 'movie' || selectedListType === 'anime_movie') {
            baseHeaders.push("Franchise", "Next Part"); // "Watched Till" removed
        } else {
            baseHeaders.push("Series Status", "Watched Till", "Next Season");
        }
        baseHeaders.push("Release Date", "Updated", "Actions");
        return baseHeaders;
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
                    <div className="search-bar-container" ref={searchContainerRef}>
                        <input type="text" placeholder={`Search in ${listViewLabels[selectedListType]}...`} className="search-input" value={searchTerm} onChange={handleSearchChange} disabled={loadingList || mediaList.length === 0} autoComplete="off" />
                        <svg className="search-icon" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        <AnimatePresence>
                            {searchSuggestions.length > 0 && (
                                <motion.ul initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="suggestions-list">
                                    {searchSuggestions.map((item) => ( <li key={item.row_index} onClick={() => handleSuggestionClick(item)}>{item.series_name || item.movies_name || item.anime_name}</li> ))}
                                </motion.ul>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                <div className="table-container">
                    <AnimatePresence mode="wait">
                        {loadingList ? ( <motion.div key="loader" className="loading-state">Loading...</motion.div> )
                         : listError ? ( <motion.div key="error" className="error-state">{listError}</motion.div> )
                         : (
                            <table className="media-table">
                                <thead><tr>{headers.map((h, i) => <th key={h} className={i === 0 ? 'text-left' : 'text-center'}>{h}</th>)}</tr></thead>
                                <tbody>
                                    {filteredTableData.map((item) => (
                                        <motion.tr key={item.row_index} layout>
                                            {selectedListType === 'series' || selectedListType === 'anime' ? (
                                                <>
                                                    <td className={`name-link text-left ${item.watched?.toLowerCase() === 'true' ? 'watched-true' : 'watched-false'}`} onClick={() => { setCameFromFranchise(null); setDetailsItem(item); }}>{item.series_name || item.anime_name}</td>
                                                    <td className="text-center">{item.series_status || 'N/A'}</td>
                                                    <td className="text-center">{item.watched_till || 'N/A'}</td>
                                                    <td className="text-center">{item.next_season || 'N/A'}</td>
                                                    <td className="text-center">{item.release_date || 'N/A'}</td>
                                                    <td className="text-center">{item.update ? new Date(item.update).toLocaleDateString() : 'N/A'}</td>
                                                </>
                                            ) : (
                                                <>
                                                    <td className={`name-link text-left ${item.watched?.toLowerCase() === 'true' ? 'watched-true' : 'watched-false'}`} onClick={() => { setCameFromFranchise(null); setDetailsItem(item); }}>{item.movies_name}</td>
                                                    <td className={`text-left ${item.franchise && item.franchise.toLowerCase() !== 'standalone' ? 'franchise-link' : ''}`} onClick={() => handleFranchiseClick(item.franchise)}>{item.franchise || 'N/A'}</td>
                                                    <td className="text-center">{item.next_part || 'N/A'}</td>
                                                    <td className="text-center">{item.release_date || 'N/A'}</td>
                                                    <td className="text-center">{item.update ? new Date(item.update).toLocaleDateString() : 'N/A'}</td>
                                                </>
                                            )}
                                            <td className="text-center"><button className="edit-button" onClick={() => setEditingItem(item)}><svg viewBox="0 0 24 24"><path fill="currentColor" d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.13,5.12L18.88,8.87M3,17.25V21H6.75L17.81,9.94L14.06,6.19L3,17.25Z" /></svg></button></td>
                                        </motion.tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
            
            {selectedFranchise && <FranchiseModal franchiseName={selectedFranchise} mediaType={selectedListType as 'movie' | 'anime_movie'} onClose={() => setSelectedFranchise(null)} onMovieSelect={handleMovieSelectFromModal} />}
            {detailsItem && <MediaDetailsModal mediaName={detailsItem.series_name || detailsItem.movies_name || detailsItem.anime_name} mediaType={detailsItem.media_type_key} onClose={handleDetailsClose} />}
            {editingItem && <EditModal item={editingItem} onClose={() => setEditingItem(null)} onUpdate={handleUpdate} />}
        </>
    );
};

export default MediaListView;