/* client/src/FranchiseModal.tsx */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

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
        const response = await axios.get(`http://localhost:5000/api/franchise/${mediaType}/${franchiseName}`);
        
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
          className="modal-content franchise-details-modal-content"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 50, opacity: 0 }}
        >
          {loading && <p>Loading franchise...</p>}
          {error && <p className="modal-error">{error}</p>}
          {!loading && !error && (
            <div className="franchise-layout-grid">
                <div className="franchise-info-panel">
                    {details?.poster_path ? (
                        <img src={details.poster_path} alt={details.name} className="franchise-poster"/>
                    ) : <div className="franchise-poster-placeholder">No Image</div>}
                    <h4>{details?.name || franchiseName}</h4>
                    <p className="franchise-overview">{details?.overview || "No overview available."}</p>
                    <p className="franchise-count"><strong>{movies.length}</strong> Titles in Tracker</p>
                </div>
                <div className="franchise-movie-list">
                     <ul>
                        {movies.map((movie) => (
                        <li key={movie.row_index}>
                            <span
                            className={`franchise-movie-title ${movie.watched?.toLowerCase() === 'true' ? 'watched-true' : 'watched-false'}`}
                            onClick={() => onMovieSelect({ ...movie, media_type_key: mediaType })}
                            >
                            {movie.movies_name}
                            </span>
                        </li>
                        ))}
                    </ul>
                </div>
            </div>
          )}
           <div className="modal-actions">
                <button className="modal-button secondary" onClick={onClose}>Close</button>
            </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};