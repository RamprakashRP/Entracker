import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';

const API_BASE = import.meta.env.PROD ? '' : 'http://localhost:5000';

class PosterQueue {
    queue: { task: () => Promise<any>, resolve: (value: any) => void, reject: (reason?: any) => void }[] = [];
    isProcessing = false;
    
    add(task: () => Promise<any>) {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this.process();
        });
    }
    
    async process() {
        if (this.isProcessing || this.queue.length === 0) return;
        this.isProcessing = true;
        const { task, resolve, reject } = this.queue.shift()!;
        try {
            const res = await Promise.race([
                task(),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Queue task timeout")), 15000))
            ]);
            resolve(res);
        } catch (e) {
            reject(e);
        }
        this.isProcessing = false;
        setTimeout(() => this.process(), 150); 
    }
}
const posterQueue = new PosterQueue();

interface MediaItem {
    row_index: number;
    media_type_key: string;
    [key: string]: any;
}

interface MediaCardProps {
    item: MediaItem;
    selectedListType: string;
    onClick: () => void;
    onEdit?: (e: React.MouseEvent) => void;
    onFranchiseClick?: (franchise: string, e: React.MouseEvent) => void;
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
        let isMounted = true;
        if (isVisible && !posterPath) {
            const fetchPoster = async () => {
                try {
                    const name = item.series_name || item.movies_name || item.anime_name;
                    const res = await posterQueue.add(() => axios.get(`${API_BASE}/api/poster/${item.media_type_key}/${encodeURIComponent(name)}`)) as any;
                    
                    if (isMounted && res.data.poster_path) {
                        setPosterPath(res.data.poster_path.startsWith('/') ? `${API_BASE}${res.data.poster_path}` : res.data.poster_path);
                    }
                } catch (e) {
                    console.error("Failed to load poster", e);
                }
            };
            fetchPoster();
        }
        return () => {
            isMounted = false;
        };
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
                backgroundImage: posterPath ? `url(${posterPath})` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                aspectRatio: '2/3',
                minHeight: '250px',
                position: 'relative'
            }}>
                {!posterPath && isVisible && (
                    <div className="poster-placeholder" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}>
                        Loading Banner...
                    </div>
                )}
                
                <div style={{ position: 'absolute', top: 0, left: 0, zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', padding: '1rem', background: posterPath ? 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, transparent 100%)' : 'none' }}>
                    <h3 className="media-title" style={{ textShadow: posterPath ? '0 2px 4px rgba(0,0,0,0.8)' : 'none', margin: 0 }}>{title}</h3>
                    <button className="media-edit-btn" onClick={(e) => onEdit && onEdit(e)} title="Edit Media" style={{ flexShrink: 0, marginLeft: '0.5rem' }}>
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
                            <span className="meta-value franchise-link" onClick={(e) => onFranchiseClick && onFranchiseClick(item.franchise, e)}>{item.franchise}</span>
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
