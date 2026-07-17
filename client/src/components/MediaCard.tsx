import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

interface MediaItem {
    row_index: number;
    media_type_key: string;
    [key: string]: any;
}

interface MediaCardProps {
    item: MediaItem;
    selectedListType: string;
    onClick: () => void;
    onEdit: (e: React.MouseEvent) => void;
    onFranchiseClick: (franchise: string, e: React.MouseEvent) => void;
}

export const MediaCard: React.FC<MediaCardProps> = ({ item, selectedListType, onClick, onEdit, onFranchiseClick }) => {
    const [posterPath, setPosterPath] = useState<string | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                setIsVisible(true);
                observer.disconnect();
            }
        }, { threshold: 0.1 });

        if (cardRef.current) {
            observer.observe(cardRef.current);
        }

        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (isVisible && !posterPath) {
            const fetchPoster = async () => {
                try {
                    const name = item.series_name || item.movies_name || item.anime_name;
                    const res = await axios.get(`${API_BASE}/api/poster/${item.media_type_key}/${encodeURIComponent(name)}`);
                    if (res.data.poster_path) {
                        setPosterPath(res.data.poster_path);
                    }
                } catch (e) {
                    console.error("Failed to load poster", e);
                }
            };
            fetchPoster();
        }
    }, [isVisible, item, posterPath]);

    const title = item.series_name || item.movies_name || item.anime_name;
    const isWatched = item.watched?.toLowerCase() === 'true';

    return (
        <motion.div 
            ref={cardRef}
            className="media-card" 
            variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
            onClick={onClick}
        >
            <div className="media-card-header" style={{ 
                backgroundImage: posterPath ? `url(${API_BASE}${posterPath})` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                height: posterPath ? '200px' : 'auto',
                position: 'relative'
            }}>
                {!posterPath && isVisible && <div className="poster-placeholder">Loading Banner...</div>}
                {posterPath && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, var(--bg-secondary) 0%, rgba(0,0,0,0) 100%)' }} />}
                
                <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', padding: '1rem', background: posterPath ? 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, transparent 100%)' : 'none' }}>
                    <h3 className="media-title" style={{ textShadow: posterPath ? '0 2px 4px rgba(0,0,0,0.8)' : 'none' }}>{title}</h3>
                    <button className="media-edit-btn" onClick={onEdit}>
                        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.13,5.12L18.88,8.87M3,17.25V21H6.75L17.81,9.94L14.06,6.19L3,17.25Z" /></svg>
                    </button>
                </div>
            </div>
            
            <div style={{ padding: '0 1rem' }}>
                <span className={`media-status-badge ${isWatched ? 'status-watched' : 'status-unwatched'}`}>
                    {isWatched ? 'Watched' : 'Watchlist'}
                </span>
            </div>
            
            <div className="media-meta">
                {selectedListType === 'series' || selectedListType === 'anime' ? (
                    <>
                        <div className="media-meta-row"><span className="meta-label">Status</span><span className="meta-value">{item.series_status || 'N/A'}</span></div>
                        <div className="media-meta-row"><span className="meta-label">Watched Till</span><span className="meta-value">{item.watched_till || 'N/A'}</span></div>
                        <div className="media-meta-row"><span className="meta-label">Next Season</span><span className="meta-value">{item.next_season || 'N/A'}</span></div>
                    </>
                ) : (
                    <>
                        <div className="media-meta-row"><span className="meta-label">Franchise</span>
                        {item.franchise && item.franchise.toLowerCase() !== 'standalone' ? (
                            <span className="meta-value franchise-link" onClick={(e) => onFranchiseClick(item.franchise, e)}>{item.franchise}</span>
                        ) : (
                            <span className="meta-value">Standalone</span>
                        )}
                        </div>
                        <div className="media-meta-row"><span className="meta-label">Next Part</span><span className="meta-value">{item.next_part || 'N/A'}</span></div>
                    </>
                )}
                <div className="media-meta-row"><span className="meta-label">Release</span><span className="meta-value">{item.release_date || 'N/A'}</span></div>
            </div>
        </motion.div>
    );
};
