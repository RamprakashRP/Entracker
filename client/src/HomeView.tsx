import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { MediaCard } from './components/MediaCard';
import { MediaDetailsModal } from './MediaDetailsModal';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

type ListMediaType = "series" | "movie" | "anime" | "anime_movie";

interface MediaItem {
    row_index: number;
    media_type_key: ListMediaType;
    [key: string]: any;
}

export function HomeView() {
    const [allMedia, setAllMedia] = useState<MediaItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [detailsItem, setDetailsItem] = useState<{ name: string; type: ListMediaType } | null>(null);

    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            try {
                const types: ListMediaType[] = ["series", "movie", "anime", "anime_movie"];
                const promises = types.map(t => axios.get(`${API_BASE}/get-media/${t}`));
                const results = await Promise.all(promises);
                
                let combined: MediaItem[] = [];
                results.forEach((res, idx) => {
                    const data = (res.data.data || []).map((item: any) => ({ ...item, media_type_key: types[idx] }));
                    combined = [...combined, ...data];
                });
                setAllMedia(combined);
            } catch (err) {
                console.error(err);
                setError("Failed to load home data.");
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, []);

    const watchlist = allMedia.filter(item => {
        const isWatched = typeof item.watched === 'string' ? item.watched.toLowerCase() === 'true' : !!item.watched;
        return !isWatched;
    });

    const continueWatching = allMedia.filter(item => {
        const isWatched = typeof item.watched === 'string' ? item.watched.toLowerCase() === 'true' : !!item.watched;
        const watchedTill = item.watched_till ? String(item.watched_till).toLowerCase() : '';
        return isWatched && watchedTill !== 'completed' && watchedTill !== 'not watched' && watchedTill !== '';
    });

    // Recently added: reverse sort by row_index (roughly latest items added at the bottom of sheets)
    const recentlyAdded = [...allMedia].sort((a, b) => b.row_index - a.row_index).slice(0, 15);

    const renderCarousel = (title: string, items: MediaItem[]) => {
        if (items.length === 0) return null;
        return (
            <div className="carousel-section">
                <h2 className="carousel-title">{title}</h2>
                <div className="carousel-container-scroll">
                    <div className="carousel-track">
                        {items.map((item, idx) => (
                            <div key={`${item.media_type_key}-${item.row_index}-${idx}`} className="carousel-item">
                                <MediaCard 
                                    media={item} 
                                    onClick={() => {
                                        const nameKey = item.media_type_key.includes('movie') ? 'movies_name' : `${item.media_type_key}_name`;
                                        setDetailsItem({ name: item[nameKey], type: item.media_type_key });
                                    }} 
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    if (loading) {
        return <div className="home-loading">Loading your dashboard...</div>;
    }

    if (error) {
        return <div className="home-error">{error}</div>;
    }

    return (
        <div className="home-view">
            <motion.div 
                className="hero-welcome"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <h1>Welcome back.</h1>
                <p>Ready to continue your journey?</p>
            </motion.div>

            {renderCarousel("Continue Watching", continueWatching)}
            {renderCarousel("Your Watchlist", watchlist)}
            {renderCarousel("Recently Added", recentlyAdded)}
            
            {allMedia.length === 0 && (
                <div className="home-empty">
                    Your library is empty. Head to "Add Media" to get started!
                </div>
            )}

            {detailsItem && (
                <MediaDetailsModal mediaName={detailsItem.name} mediaType={detailsItem.type} onClose={() => setDetailsItem(null)} />
            )}
        </div>
    );
}
