/* client/src/MediaListView.tsx */
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { FranchiseModal } from './FranchiseModal'; // We still need our modal

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
    
    const [selectedFranchise, setSelectedFranchise] = useState<string | null>(null);

    // Reverted to a single fetch function for simplicity
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

    // This filters our single list based on the search term
    const filteredTableData = useMemo(() => {
        if (!searchTerm) return mediaList;
        return mediaList.filter(item => {
            const name = item.series_name || item.movies_name || item.anime_name || '';
            return name.toLowerCase().includes(searchTerm.toLowerCase());
        });
    }, [mediaList, searchTerm]);

    const handleFranchiseClick = (franchiseName: string) => {
        // Only open the modal if it's a real franchise, not "Standalone"
        if (franchiseName && franchiseName.toLowerCase() !== 'standalone') {
            setSelectedFranchise(franchiseName);
        }
    };

    // Define table headers based on the selected media type
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
                    <div className="search-bar-container">
                        <input
                            type="text"
                            placeholder={`Search in ${listViewLabels[selectedListType]}...`}
                            className="search-input"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            disabled={loadingList || mediaList.length === 0}
                        />
                        <svg className="search-icon" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
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
                                                    {/* FIX: Make the check case-insensitive */}
                                                    <td className={item.watched?.toLowerCase() === 'true' ? 'watched-true' : 'watched-false'}>
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
                                                    {/* FIX: Make the check case-insensitive */}
                                                    <td className={item.watched?.toLowerCase() === 'true' ? 'watched-true' : 'watched-false'}>
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
        </>
    );
};

export default MediaListView;