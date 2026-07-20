/* client/src/MediaListView.tsx */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { FranchiseModal, type FranchiseMovieItem } from './FranchiseModal';
import { MediaDetailsModal } from './MediaDetailsModal';

import { MediaCard } from './components/MediaCard';

const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? '' : 'http://localhost:5000');

export type ListMediaType = "series" | "movie" | "anime" | "anime_movie";

const listViewLabels: Record<ListMediaType, string> = {
    series: "TV Series", movie: "Movie", anime: "Anime Series", anime_movie: "Anime Movie",
};

interface MediaItem {
    row_index: number;
    media_type_key: ListMediaType;
    [key: string]: any;
}

interface MediaListViewProps {
    isAdmin?: boolean;
    onDetailsClick?: (item: MediaItem) => void;
    onEditClick?: (item: MediaItem) => void;
}

const MediaListView: React.FC<MediaListViewProps> = ({ isAdmin = false, onDetailsClick, onEditClick }) => {
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
    const [showSortMenu, setShowSortMenu] = useState(false);
    const [showTagMenu, setShowTagMenu] = useState(false);
    const [tagSearchQuery, setTagSearchQuery] = useState("");
    const [searchSuggestions, setSearchSuggestions] = useState<MediaItem[]>([]);
    const [focusedSuggestionIndex, setFocusedSuggestionIndex] = useState(-1);
    const [filteredMediaList, setFilteredMediaList] = useState<MediaItem[]>([]);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const searchContainerRef = useRef<HTMLDivElement>(null);
    const sortMenuRef = useRef<HTMLDivElement>(null);
    const tagMenuRef = useRef<HTMLDivElement>(null);
    
    const [selectedFranchise, setSelectedFranchise] = useState<{name: string, type: 'movie' | 'anime_movie'} | null>(null);
    const [detailsItem, setDetailsItem] = useState<MediaItem | null>(null);
    const [cameFromFranchise, setCameFromFranchise] = useState<{name: string, type: 'movie' | 'anime_movie'} | null>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
                setSearchSuggestions([]);
            }
            if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
                setShowSortMenu(false);
            }
            if (tagMenuRef.current && !tagMenuRef.current.contains(event.target as Node)) {
                setShowTagMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
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
        setFocusedSuggestionIndex(-1);
        if (value.length > 0 && mediaList.length > 0) {
            setSearchSuggestions(mediaList.filter(item => {
                const searchableText = [
                    item.series_name,
                    item.movies_name,
                    item.anime_name,
                    item.franchise,
                    item.series_status
                ].filter(Boolean).join(' ').toLowerCase();
                return searchableText.includes(value.toLowerCase().trim());
            }).slice(0, 5));
        } else {
            setSearchSuggestions([]);
        }
    };
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (searchSuggestions.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setFocusedSuggestionIndex(prev => (prev < searchSuggestions.length - 1 ? prev + 1 : prev));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setFocusedSuggestionIndex(prev => (prev > 0 ? prev - 1 : 0));
            } else if (e.key === 'Enter' && focusedSuggestionIndex >= 0) {
                e.preventDefault();
                handleSuggestionClick(searchSuggestions[focusedSuggestionIndex]);
            }
        }
    };
    
    const handleSuggestionClick = (item: MediaItem) => {
        const nameKey = item.media_type_key.includes('movie') ? 'movies_name' : `${item.media_type_key}_name`;
        setSearchTerm(item[nameKey] ? String(item[nameKey]) : '');
        setSearchSuggestions([]);
        setFocusedSuggestionIndex(-1);
    };

    const availableTags = useMemo(() => {
        const tags = new Set<string>();
        mediaList.forEach(item => {
            if (item.franchise && item.franchise.toLowerCase() !== 'standalone') {
                item.franchise.split(',').forEach((t: string) => tags.add(t.trim()));
            }
        });
        return Array.from(tags).sort();
    }, [mediaList]);

    useEffect(() => {
        if (mediaList.length === 0) return;
        
        let result = mediaList.filter(item => selectedCategories.includes(item.media_type_key));
        
        // Search Verification (Bulletproof Engine)
        if (searchTerm && searchTerm.trim() !== '') {
            const lowerSearchTerm = searchTerm.toLowerCase().trim();
            result = result.filter(item => {
                const searchableText = [
                    item.series_name,
                    item.movies_name,
                    item.anime_name,
                    item.franchise,
                    item.series_status
                ].filter(Boolean).join(' ').toLowerCase();
                
                return searchableText.includes(lowerSearchTerm);
            });
        }
        
        // Filter by Tags
        if (selectedTags.length > 0) {
            result = result.filter(item => {
                if (!item.franchise || item.franchise.toLowerCase() === 'standalone') return false;
                const itemTags = item.franchise.split(',').map((t: string) => t.trim());
                return selectedTags.some(tag => itemTags.includes(tag));
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
            const getValidTime = (dateStr: any) => {
                if (!dateStr || dateStr === 'N/A' || dateStr === 'Invalid Date') return 0;
                const time = new Date(dateStr).getTime();
                return isNaN(time) ? 0 : time;
            };

            if (sortOption === 'recently-updated') {
                const timeA = getValidTime(a.update);
                const timeB = getValidTime(b.update);
                if (timeA !== timeB) return timeB - timeA;
                return (b.row_index || 0) - (a.row_index || 0);
            }
            if (sortOption === 'name-asc' || sortOption === 'name-desc') {
                const nameA = String(a.series_name || a.movies_name || a.anime_name || '').toLowerCase();
                const nameB = String(b.series_name || b.movies_name || b.anime_name || '').toLowerCase();
                if (sortOption === 'name-asc') return nameA.localeCompare(nameB);
                return nameB.localeCompare(nameA);
            }
            if (sortOption === 'date-new') {
                return getValidTime(b.release_date) - getValidTime(a.release_date);
            }
            if (sortOption === 'date-old') {
                return getValidTime(a.release_date) - getValidTime(b.release_date);
            }
            return 0;
        });

        setFilteredMediaList(result);
    }, [mediaList, searchTerm, selectedCategories, selectedStatuses, selectedTags, sortOption]);

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

                        {availableTags.length > 0 && (
                            <div className="multi-select-container" ref={tagMenuRef}>
                                <button className="multi-select-button premium-select" onClick={() => setShowTagMenu(!showTagMenu)} disabled={loadingList}>
                                    Tags ({selectedTags.length})
                                </button>
                                {showTagMenu && (
                                    <div className="multi-select-menu" style={{ maxHeight: '350px', display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-glass)', position: 'sticky', top: 0, background: 'var(--bg-tertiary)', zIndex: 2 }}>
                                            <input 
                                                type="text" 
                                                placeholder="Search tags..." 
                                                value={tagSearchQuery}
                                                onChange={(e) => setTagSearchQuery(e.target.value)}
                                                style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-glass-light)', border: '1px solid var(--border-glass)', borderRadius: '6px', color: 'var(--text-primary)' }}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        </div>
                                        <div style={{ overflowY: 'auto', flex: 1 }}>
                                            {availableTags
                                                .filter(tag => tag.toLowerCase().includes(tagSearchQuery.toLowerCase().trim()))
                                                .map(tag => (
                                                <label key={tag} className="multi-select-option" style={{ padding: '0.5rem 1rem' }}>
                                                    <input type="checkbox" checked={selectedTags.includes(tag)} onChange={() => {
                                                        if (selectedTags.includes(tag)) setSelectedTags(selectedTags.filter(t => t !== tag));
                                                        else setSelectedTags([...selectedTags, tag]);
                                                    }} />
                                                    <span className="tag-pill" style={{ fontSize: '0.8rem', padding: '2px 8px', background: 'rgba(6, 182, 212, 0.1)', color: 'var(--accent-primary)', borderRadius: '12px' }}>{tag}</span>
                                                </label>
                                            ))}
                                            {availableTags.filter(tag => tag.toLowerCase().includes(tagSearchQuery.toLowerCase().trim())).length === 0 && (
                                                <div style={{ padding: '1rem', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>No tags found.</div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="multi-select-container" ref={sortMenuRef}>
                            <button className="multi-select-button premium-select" onClick={() => setShowSortMenu(!showSortMenu)} disabled={loadingList}>
                                {sortOption === 'recently-updated' ? 'Recently Updated' :
                                 sortOption === 'name-asc' ? 'Name (A-Z)' :
                                 sortOption === 'name-desc' ? 'Name (Z-A)' :
                                 sortOption === 'date-new' ? 'Release (Newest)' : 'Release (Oldest)'}
                            </button>
                            {showSortMenu && (
                                <div className="multi-select-menu" style={{ minWidth: '180px' }}>
                                    <label className="multi-select-option" style={{ padding: '0.75rem 1rem' }}>
                                        <input type="radio" name="sortGroup" checked={sortOption === 'recently-updated'} onChange={() => { setSortOption('recently-updated'); setShowSortMenu(false); }} />
                                        <span>Recently Updated</span>
                                    </label>
                                    <label className="multi-select-option" style={{ padding: '0.75rem 1rem' }}>
                                        <input type="radio" name="sortGroup" checked={sortOption === 'name-asc'} onChange={() => { setSortOption('name-asc'); setShowSortMenu(false); }} />
                                        <span>Name (A-Z)</span>
                                    </label>
                                    <label className="multi-select-option" style={{ padding: '0.75rem 1rem' }}>
                                        <input type="radio" name="sortGroup" checked={sortOption === 'name-desc'} onChange={() => { setSortOption('name-desc'); setShowSortMenu(false); }} />
                                        <span>Name (Z-A)</span>
                                    </label>
                                    <label className="multi-select-option" style={{ padding: '0.75rem 1rem' }}>
                                        <input type="radio" name="sortGroup" checked={sortOption === 'date-new'} onChange={() => { setSortOption('date-new'); setShowSortMenu(false); }} />
                                        <span>Release (Newest)</span>
                                    </label>
                                    <label className="multi-select-option" style={{ padding: '0.75rem 1rem' }}>
                                        <input type="radio" name="sortGroup" checked={sortOption === 'date-old'} onChange={() => { setSortOption('date-old'); setShowSortMenu(false); }} />
                                        <span>Release (Oldest)</span>
                                    </label>
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', width: '100%', maxWidth: '400px' }}>
                        <div className="search-bar-container" ref={searchContainerRef} style={{ margin: 0, flex: 1 }}>
                            <input 
                                type="text" 
                                placeholder="Search library..." 
                                className="search-input" 
                                value={searchTerm} 
                                onChange={handleSearchChange}
                                onKeyDown={handleKeyDown} 
                                disabled={loadingList || mediaList.length === 0} 
                                autoComplete="off" 
                            />
                            {searchTerm && (
                                <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'red', fontSize: '0.8rem', zIndex: 10 }}>
                                    Search is: "{searchTerm}"
                                </span>
                            )}
                            <svg className="search-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z" /></svg>
                            <AnimatePresence>
                                {searchSuggestions.length > 0 && (
                                    <motion.ul initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="suggestions-list">
                                        {searchSuggestions.map((item, index) => ( 
                                            <li 
                                                key={item.row_index} 
                                                onClick={() => handleSuggestionClick(item)}
                                                style={{ background: index === focusedSuggestionIndex ? 'rgba(255,255,255,0.1)' : 'transparent', cursor: 'pointer' }}
                                                onMouseEnter={() => setFocusedSuggestionIndex(index)}
                                            >
                                                {item.series_name || item.movies_name || item.anime_name}
                                            </li> 
                                        ))}
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
                        ) : filteredMediaList.length === 0 ? (
                            <div className="empty-state">
                                <p>No media found matching your filters.</p>
                            </div>
                        ) : viewMode === 'grid' ? (
                            <motion.div key="grid" className="media-grid" variants={{ show: { transition: { staggerChildren: 0.05 } } }} initial="hidden" animate="show">
                                {filteredMediaList.map((item) => (
                                    <MediaCard 
                                        key={`${item.media_type_key}-${item.row_index}`} 
                                        item={item} 
                                        selectedListType={item.media_type_key} 
                                        onClick={() => { onDetailsClick?.(item); setCameFromFranchise(null); setDetailsItem(item); }}
                                        onEdit={isAdmin ? (e) => { e.stopPropagation(); onEditClick?.(item); } : undefined}
                                        onFranchiseClick={(franchise, e) => { e.stopPropagation(); handleFranchiseClick(franchise, item.media_type_key as 'movie'|'anime_movie'); }}
                                    />
                                ))}
                            </motion.div>
                        ) : (
                            <motion.div key="list" className="compact-list-container" variants={{ show: { transition: { staggerChildren: 0.03 } } }} initial="hidden" animate="show">
                                {filteredMediaList.map((item) => {
                                    const title = item.series_name || item.movies_name || item.anime_name;
                                    const isWatched = (typeof item.watched === 'string' ? item.watched.toLowerCase() === 'true' : !!item.watched);
                                    return (
                                        <motion.div 
                                            key={item.row_index} 
                                            className="compact-list-row"
                                            variants={{ hidden: { opacity: 0, x: -20 }, show: { opacity: 1, x: 0 } }}
                                            onClick={() => { onDetailsClick?.(item); setCameFromFranchise(null); setDetailsItem(item); }}
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
                                                {isAdmin && (
                                                    <button className="media-edit-btn" style={{ position: 'static', background: 'transparent' }} onClick={(e) => { e.stopPropagation(); onEditClick?.(item); }}>
                                                        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.13,5.12L18.88,8.87M3,17.25V21H6.75L17.81,9.94L14.06,6.19L3,17.25Z" /></svg>
                                                    </button>
                                                )}
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
            {detailsItem && <MediaDetailsModal mediaName={detailsItem.series_name || detailsItem.movies_name || detailsItem.anime_name} mediaType={detailsItem.media_type_key} mediaItem={detailsItem} onClose={handleDetailsClose} />}
        </>
    );
};

export default MediaListView;