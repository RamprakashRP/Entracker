/* client/src/MediaListView.tsx */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { FranchiseModal, type FranchiseMovieItem } from './FranchiseModal';
import { MediaDetailsModal } from './MediaDetailsModal';
import { EditModal } from './EditModal';
import { MediaCard } from './components/MediaCard';

const API_BASE = import.meta.env.PROD ? '' : 'http://localhost:5000';

export type ListMediaType = "series" | "movie" | "anime" | "anime_movie";

const listViewLabels: Record<ListMediaType, string> = {
    series: "TV Series", movie: "Movie", anime: "Anime Series", anime_movie: "Anime Movie",
};

interface MediaItem {
    row_index: number;
    media_type_key: ListMediaType;
    [key: string]: any;
}

const MediaListView: React.FC = () => {
    const [selectedCategories, setSelectedCategories] = useState<ListMediaType[]>(['series', 'movie', 'anime', 'anime_movie']);
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['watched', 'watchlist']);
    const [mediaList, setMediaList] = useState<MediaItem[]>([]);
    const [loadingList, setLoadingList] = useState(false);
    const [listError, setListError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [sortOption, setSortOption] = useState('recently-updated');
    
    // UI state for custom multi-select dropdowns
    const [showCategoryMenu, setShowCategoryMenu] = useState(false);
    const [showStatusMenu, setShowStatusMenu] = useState(false);
    const [searchSuggestions, setSearchSuggestions] = useState<MediaItem[]>([]);
    const searchContainerRef = useRef<HTMLDivElement>(null);
    
    const [selectedFranchise, setSelectedFranchise] = useState<{name: string, type: 'movie' | 'anime_movie'} | null>(null);
    const [detailsItem, setDetailsItem] = useState<MediaItem | null>(null);
    const [editingItem, setEditingItem] = useState<MediaItem | null>(null);
    const [cameFromFranchise, setCameFromFranchise] = useState<{name: string, type: 'movie' | 'anime_movie'} | null>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
                setSearchSuggestions([]);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const fetchAllMedia = async () => {
        setLoadingList(true);
        setListError(null);
        try {
            const types: ListMediaType[] = ["series", "movie", "anime", "anime_movie"];
            const promises = types.map(t => axios.get(`${API_BASE}/api/get-media/${t}`));
            const results = await Promise.all(promises);
            
            let combined: MediaItem[] = [];
            results.forEach((res, idx) => {
                const data = (res.data.data || []).map((item: any) => ({ ...item, media_type_key: types[idx] }));
                combined = [...combined, ...data];
            });
            setMediaList(combined);
        } catch (err: any) {
            setListError(err.response?.data?.error || "Failed to load list.");
        } finally {
            setLoadingList(false);
        }
    };

    useEffect(() => {
        fetchAllMedia();
    }, []);
    
    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearchTerm(value);
        if (value.length > 0 && mediaList.length > 0) {
            setSearchSuggestions(mediaList.filter(item => {
                const nameKey = item.media_type_key.includes('movie') ? 'movies_name' : `${item.media_type_key}_name`;
                return item[nameKey]?.toLowerCase().includes(value.toLowerCase());
            }).slice(0, 5));
        } else {
            setSearchSuggestions([]);
        }
    };
    
    const handleSuggestionClick = (item: MediaItem) => {
        const nameKey = item.media_type_key.includes('movie') ? 'movies_name' : `${item.media_type_key}_name`;
        setSearchTerm(item[nameKey] || '');
        setSearchSuggestions([]);
    };

    const filteredTableData = useMemo(() => {
        let result = mediaList.filter(item => selectedCategories.includes(item.media_type_key));
        
        // Search
        if (searchTerm) {
            result = result.filter(item => {
                const nameKey = item.media_type_key.includes('movie') ? 'movies_name' : `${item.media_type_key}_name`;
                return item[nameKey]?.toLowerCase().includes(searchTerm.toLowerCase());
            });
        }
        
        // Filter by Status Checkbox
        result = result.filter(item => {
            const isWatched = typeof item.watched === 'string' ? item.watched.toLowerCase() === 'true' : !!item.watched;
            if (isWatched && selectedStatuses.includes('watched')) return true;
            if (!isWatched && selectedStatuses.includes('watchlist')) return true;
            return false;
        });

        // Sort
        result.sort((a, b) => {
            const nameKeyA = a.media_type_key.includes('movie') ? 'movies_name' : `${a.media_type_key}_name`;
            const nameKeyB = b.media_type_key.includes('movie') ? 'movies_name' : `${b.media_type_key}_name`;
            if (sortOption === 'name-asc') return (a[nameKeyA] || '').localeCompare(b[nameKeyB] || '');
            if (sortOption === 'name-desc') return (b[nameKeyB] || '').localeCompare(a[nameKeyA] || '');
            if (sortOption === 'date-new') {
                const dA = new Date(a.release_date || 0).getTime();
                const dB = new Date(b.release_date || 0).getTime();
                return dB - dA;
            }
            if (sortOption === 'date-old') {
                const dA = new Date(a.release_date || 0).getTime();
                const dB = new Date(b.release_date || 0).getTime();
                return dA - dB;
            }
            if (sortOption === 'recently-updated') {
                const dA = new Date(a.update || 0).getTime();
                const dB = new Date(b.update || 0).getTime();
                if (dA !== dB) return dB - dA;
                return b.row_index - a.row_index; // fallback to most recent row added
            }
            return 0;
        });

        return result;
    }, [mediaList, searchTerm, selectedCategories, selectedStatuses, sortOption]);

    const handleFranchiseClick = (franchiseName: string, type: 'movie' | 'anime_movie') => {
        if (franchiseName && franchiseName.toLowerCase() !== 'standalone') {
            setSelectedFranchise({name: franchiseName, type});
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
        fetchAllMedia();
    };

    const toggleCategory = (type: ListMediaType) => {
        setSelectedCategories(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
    };

    const toggleStatus = (status: string) => {
        setSelectedStatuses(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]);
    };

    return (
        <>
            <motion.div className="media-list-view-container" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="library-control-bar">
                    <div className="library-filters">
                        <div className="multi-select-container">
                            <button className="multi-select-button premium-select" onClick={() => setShowCategoryMenu(!showCategoryMenu)}>
                                Categories ({selectedCategories.length})
                            </button>
                            {showCategoryMenu && (
                                <div className="multi-select-menu">
                                    <div className="multi-select-actions">
                                        <button type="button" onClick={() => setSelectedCategories(['series', 'movie', 'anime', 'anime_movie'])}>All</button>
                                        <button type="button" onClick={() => setSelectedCategories([])}>Clear</button>
                                    </div>
                                    {Object.entries(listViewLabels).map(([val, label]) => (
                                        <label key={val} className="multi-select-option">
                                            <input type="checkbox" checked={selectedCategories.includes(val as ListMediaType)} onChange={() => toggleCategory(val as ListMediaType)} />
                                            <span>{label}</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="multi-select-container">
                            <button className="multi-select-button premium-select" onClick={() => setShowStatusMenu(!showStatusMenu)}>
                                Status ({selectedStatuses.length})
                            </button>
                            {showStatusMenu && (
                                <div className="multi-select-menu">
                                    <div className="multi-select-actions">
                                        <button type="button" onClick={() => setSelectedStatuses(['watched', 'watchlist'])}>All</button>
                                        <button type="button" onClick={() => setSelectedStatuses([])}>Clear</button>
                                    </div>
                                    <label className="multi-select-option">
                                        <input type="checkbox" checked={selectedStatuses.includes('watched')} onChange={() => toggleStatus('watched')} />
                                        <span>Tracked</span>
                                    </label>
                                    <label className="multi-select-option">
                                        <input type="checkbox" checked={selectedStatuses.includes('watchlist')} onChange={() => toggleStatus('watchlist')} />
                                        <span>Watchlist</span>
                                    </label>
                                </div>
                            )}
                        </div>

                        <select className="premium-select" value={sortOption} onChange={(e) => setSortOption(e.target.value)} disabled={loadingList}>
                            <option value="recently-updated">Recently Updated</option>
                            <option value="name-asc">Name (A-Z)</option>
                            <option value="name-desc">Name (Z-A)</option>
                            <option value="date-new">Release (Newest)</option>
                            <option value="date-old">Release (Oldest)</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', width: '100%', maxWidth: '400px' }}>
                        <div className="search-bar-container" ref={searchContainerRef} style={{ margin: 0, flex: 1 }}>
                            <input type="text" placeholder="Search..." className="search-input" value={searchTerm} onChange={handleSearchChange} disabled={loadingList || mediaList.length === 0} autoComplete="off" />
                            <svg className="search-icon" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            <AnimatePresence>
                                {searchSuggestions.length > 0 && (
                                    <motion.ul initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="suggestions-list">
                                        {searchSuggestions.map((item) => ( <li key={item.row_index} onClick={() => handleSuggestionClick(item)}>{item.series_name || item.movies_name || item.anime_name}</li> ))}
                                    </motion.ul>
                                )}
                            </AnimatePresence>
                        </div>
                        <div className="view-toggles">
                            <button className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')} title="List View">
                                <svg viewBox="0 0 24 24"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" /></svg>
                            </button>
                            <button className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')} title="Grid View">
                                <svg viewBox="0 0 24 24"><path d="M3 11h8V3H3v8zm0 10h8v-8H3v8zm10 0h8v-8h-8v8zm0-18v8h8V3h-8z" /></svg>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="media-grid-container">
                    <AnimatePresence mode="wait">
                        {loadingList ? (
                            <div className="loading-state">
                                <div className="spinner"></div>
                                <p>Loading your library...</p>
                            </div>
                        ) : listError ? (
                            <div className="error-state">
                                <p>{listError}</p>
                                <button className="premium-button" onClick={fetchAllMedia}>Retry</button>
                            </div>
                        ) : filteredTableData.length === 0 ? (
                            <div className="empty-state">
                                <p>No media found matching your filters.</p>
                            </div>
                        ) : viewMode === 'grid' ? (
                            <motion.div key="grid" className="media-grid" variants={{ show: { transition: { staggerChildren: 0.05 } } }} initial="hidden" animate="show">
                                {filteredTableData.map((item) => (
                                    <MediaCard 
                                        key={item.row_index} 
                                        item={item} 
                                        selectedListType={item.media_type_key} 
                                        onClick={() => { setCameFromFranchise(null); setDetailsItem(item); }}
                                        onEdit={(e) => { e.stopPropagation(); setEditingItem(item); }}
                                        onFranchiseClick={(franchise, e) => { e.stopPropagation(); handleFranchiseClick(franchise, item.media_type_key as 'movie'|'anime_movie'); }}
                                    />
                                ))}
                            </motion.div>
                        ) : (
                            <motion.div key="list" className="compact-list-container" variants={{ show: { transition: { staggerChildren: 0.03 } } }} initial="hidden" animate="show">
                                {filteredTableData.map((item) => {
                                    const title = item.series_name || item.movies_name || item.anime_name;
                                    const isWatched = (typeof item.watched === 'string' ? item.watched.toLowerCase() === 'true' : !!item.watched);
                                    return (
                                        <motion.div 
                                            key={item.row_index} 
                                            className="compact-list-row"
                                            variants={{ hidden: { opacity: 0, x: -20 }, show: { opacity: 1, x: 0 } }}
                                            onClick={() => { setCameFromFranchise(null); setDetailsItem(item); }}
                                        >
                                            <div className="list-title">{title}</div>
                                            <div className="list-meta hide-on-small">{item.release_date || 'N/A'}</div>
                                            {item.media_type_key.includes('movie') ? (
                                                <div className="list-meta hide-on-mobile">{item.franchise === 'Standalone' ? '-' : item.franchise}</div>
                                            ) : (
                                                <div className="list-meta hide-on-mobile">{item.series_status || 'N/A'}</div>
                                            )}
                                            <div>
                                                <span className={`media-status-badge ${isWatched ? 'status-watched' : 'status-unwatched'}`}>
                                                    {isWatched ? 'Watched' : 'Watchlist'}
                                                </span>
                                            </div>
                                            <div>
                                                <button className="media-edit-btn" style={{ position: 'static', background: 'transparent' }} onClick={(e) => { e.stopPropagation(); setEditingItem(item); }}>
                                                    <svg viewBox="0 0 24 24"><path fill="currentColor" d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.13,5.12L18.88,8.87M3,17.25V21H6.75L17.81,9.94L14.06,6.19L3,17.25Z" /></svg>
                                                </button>
                                            </div>
                                        </motion.div>
                                    );
                                    })}
                                </motion.div>
                            )
                        }
                    </AnimatePresence>
                </div>
            </motion.div>
            
            {selectedFranchise && <FranchiseModal franchiseName={selectedFranchise.name} mediaType={selectedFranchise.type} onClose={() => setSelectedFranchise(null)} onMovieSelect={handleMovieSelectFromModal} />}
            {detailsItem && <MediaDetailsModal mediaName={detailsItem.series_name || detailsItem.movies_name || detailsItem.anime_name} mediaType={detailsItem.media_type_key} onClose={handleDetailsClose} />}
            {editingItem && <EditModal item={editingItem} onClose={() => setEditingItem(null)} onUpdate={handleUpdate} />}
        </>
    );
};

export default MediaListView;