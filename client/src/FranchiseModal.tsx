/* client/src/FranchiseModal.tsx */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? '' : 'http://localhost:5000');

export interface FranchiseMovieItem {
  row_index: number;
  movies_name: string;
  watched: string;
  release_date: string;
  media_type_key: 'movie' | 'anime_movie';
  [key: string]: any;
}

interface FranchiseDetails {
    name: string;
    overview: string;
    poster_path: string | null;
}

interface FranchiseModalProps {
  franchiseName: string;
  mediaType: 'movie' | 'anime_movie';
  onClose: () => void;
  onMovieSelect: (movie: FranchiseMovieItem) => void;
}

export const FranchiseModal: React.FC<FranchiseModalProps> = ({ franchiseName, mediaType, onClose, onMovieSelect }) => {
  const [movies, setMovies] = useState<FranchiseMovieItem[]>([]);
  const [details, setDetails] = useState<FranchiseDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFranchiseData = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await axios.get(`${API_BASE}/api/franchise/${mediaType}/${franchiseName}`);
        
        const sortedMovies = (response.data.movies || []).sort((a: FranchiseMovieItem, b: FranchiseMovieItem) => {
            const dateA = a.release_date ? new Date(a.release_date) : new Date(0);
            const dateB = b.release_date ? new Date(b.release_date) : new Date(0);
            if (isNaN(dateA.getTime())) return 1;
            if (isNaN(dateB.getTime())) return -1;
            return dateA.getTime() - dateB.getTime();
        });

        setMovies(sortedMovies);
        setDetails(response.data.details);

      } catch (err) {
        setError('Failed to load franchise data.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (franchiseName) {
      fetchFranchiseData();
    }
  }, [franchiseName, mediaType]);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="modal-overlay"
        onClick={handleOverlayClick}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="modal-content details-modal-content"
          initial={{ y: 50, scale: 0.95, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          exit={{ y: 50, scale: 0.95, opacity: 0 }}
        >
          {loading && <div className="loading-state">Loading franchise...</div>}
          {error && <div className="error-state">{error}</div>}
          {!loading && !error && (
            <>
                <div className="details-hero" style={{ backgroundImage: `url(${details?.poster_path?.startsWith('/') ? `${API_BASE}${details.poster_path}` : details?.poster_path})` }}>
                    <div className="details-hero-overlay">
                        <div className="details-hero-content">
                            {details?.poster_path ? (
                                <img src={details.poster_path.startsWith('/') ? `${API_BASE}${details.poster_path}` : details.poster_path} alt={details.name} className="details-poster"/>
                            ) : <div className="details-poster" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)' }}>No Image</div>}
                            <div className="details-header-text">
                                <h3>{details?.name || franchiseName}</h3>
                                <div className="details-rating">
                                    <strong>{movies.length}</strong> Titles in Tracker
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="details-body" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '2rem' }}>
                    <div style={{ flex: '1 1 300px' }}>
                        <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>Overview</h4>
                        <p className="details-overview">{details?.overview || "No overview available."}</p>
                    </div>
                    <div style={{ flex: '1 1 300px' }}>
                        <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>Included Titles</h4>
                        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: 0 }}>
                            {movies.map((movie) => (
                            <li key={movie.row_index}>
                                <div
                                style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '0.75rem 1rem', background: 'var(--bg-glass-light)', 
                                    borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'all 0.2s',
                                    borderLeft: `4px solid ${movie.watched?.toLowerCase() === 'true' || movie.watched?.toLowerCase() === 'watched' ? 'var(--status-success)' : 'var(--status-warning)'}`
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-glass-hover)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-glass-light)'}
                                onClick={(e) => { e.currentTarget.style.transform = 'scale(0.98)'; setTimeout(() => onMovieSelect({ ...movie, media_type_key: mediaType }), 100); }}
                                >
                                    <span style={{ fontWeight: '500' }}>{movie.movies_name}</span>
                                    {(movie.watched_till && movie.watched_till !== 'N/A' && movie.watched_till !== 'Not Watched') && (
                                        <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', opacity: 0.8 }}>
                                            {movie.watched_till}
                                        </span>
                                    )}
                                </div>
                            </li>
                            ))}
                        </ul>
                    </div>
                </div>
                <div className="modal-actions" style={{ padding: '0 2rem 2rem 2rem', marginTop: 0 }}>
                    <button className="premium-button secondary" onClick={onClose}>Close</button>
                </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};