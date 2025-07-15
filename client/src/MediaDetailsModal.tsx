/* client/src/MediaDetailsModal.tsx */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

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
    const API_URL = import.meta.env.VITE_API_BASE_URL;
    const [details, setDetails] = useState<Details | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchDetails = async () => {
            if (!mediaName || !mediaType) return;
            setLoading(true);
            setError(null);
            try {
                const response = await axios.get(`${API_URL}/api/details/${mediaType}/${encodeURIComponent(mediaName)}`);
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
                <motion.div className="modal-content details-modal-content" initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}>
                    {loading && <p>Loading details...</p>}
                    {error && <p className="modal-error">{error}</p>}
                    {details && (
                        <>
                            <div className="details-header">
                                {details.poster_path && <img src={details.poster_path} alt={details.name} className="details-poster" />}
                                <div className="details-header-info">
                                    <h3>{details.name}</h3>
                                    <div className="details-rating">⭐ {details.vote_average.toFixed(1)} / 10</div>
                                    <div className="details-genres">
                                        {details.genres.map(g => <span key={g} className="genre-tag">{g}</span>)}
                                    </div>
                                </div>
                            </div>
                            <p className="details-overview">{details.overview}</p>
                            
                            {details.providers.length > 0 && (
                                <div className="details-providers">
                                    <h4>Available on:</h4>
                                    <div className="provider-logos">
                                        {details.providers.map(p => (
                                            <img key={p.provider_name} src={`https://image.tmdb.org/t/p/original${p.logo_path}`} alt={p.provider_name} title={p.provider_name} className="provider-logo" />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                    <div className="modal-actions">
                        <button className="modal-button secondary" onClick={onClose}>Close</button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};