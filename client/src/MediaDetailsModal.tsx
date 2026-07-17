/* client/src/MediaDetailsModal.tsx */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

const API_BASE = import.meta.env.PROD ? '' : 'http://localhost:5000';

interface Details {
    name: string;
    overview: string;
    poster_path: string | null;
    vote_average: number;
    genres: string[];
    providers: { logo_path: string; provider_name: string }[];
}

interface MediaDetailsModalProps {
    mediaName: string;
    mediaType: string;
    onClose: () => void;
}

export const MediaDetailsModal: React.FC<MediaDetailsModalProps> = ({ mediaName, mediaType, onClose }) => {
    const [details, setDetails] = useState<Details | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchDetails = async () => {
            if (!mediaName || !mediaType) return;
            setLoading(true);
            setError(null);
            try {
                const response = await axios.get(`${API_BASE}/api/details/${mediaType}/${encodeURIComponent(mediaName)}`);
                setDetails(response.data.data);
            } catch (err) {
                setError('Failed to load details.');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchDetails();
    }, [mediaName, mediaType]);
    
    const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <AnimatePresence>
            <motion.div className="modal-overlay" onClick={handleOverlayClick} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <motion.div className="modal-content details-modal-content" initial={{ y: 50, scale: 0.95, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 50, scale: 0.95, opacity: 0 }}>
                    {loading && <div className="loading-state">Loading details...</div>}
                    {error && <div className="error-state">{error}</div>}
                    {details && (
                        <>
                            <div className="details-hero" style={{ backgroundImage: `url(${details.poster_path?.startsWith('/') ? `${API_BASE}${details.poster_path}` : details.poster_path})` }}>
                                <div className="details-hero-overlay">
                                    <div className="details-hero-content">
                                        {details.poster_path && <img src={details.poster_path.startsWith('/') ? `${API_BASE}${details.poster_path}` : details.poster_path} alt={details.name} className="details-poster" />}
                                        <div className="details-header-text">
                                            <h3>{details.name}</h3>
                                            <div className="details-rating">
                                                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                                                {details.vote_average.toFixed(1)} / 10
                                            </div>
                                            <div className="details-genres">
                                                {details.genres.map(g => <span key={g} className="genre-tag">{g}</span>)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="details-body">
                                <p className="details-overview">{details.overview}</p>
                                
                                {details.providers.length > 0 && (
                                    <div className="details-providers">
                                        <h4>Available on:</h4>
                                        <div className="provider-logos">
                                            {details.providers.map(p => (
                                                <img key={p.provider_name} src={`${API_BASE}/api/image-proxy?url=https://image.tmdb.org/t/p/original${p.logo_path}`} alt={p.provider_name} title={p.provider_name} className="provider-logo" />
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div className="modal-actions">
                                    <button className="premium-button secondary" onClick={onClose}>Close</button>
                                </div>
                            </div>
                        </>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};