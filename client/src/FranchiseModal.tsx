/* client/src/FranchiseModal.tsx */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

interface MovieItem {
  row_index: number;
  movies_name: string;
  watched_till: string;
  [key: string]: any;
}

interface FranchiseModalProps {
  franchiseName: string;
  mediaType: 'movie' | 'anime_movie';
  onClose: () => void;
}

export const FranchiseModal: React.FC<FranchiseModalProps> = ({ franchiseName, mediaType, onClose }) => {
  const [movies, setMovies] = useState<MovieItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMovies = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await axios.get(`http://localhost:5000/api/franchise/${mediaType}/${franchiseName}`);
        
        // Sort movies by the new release_date field
        const sortedData = (response.data.data || []).sort((a: MovieItem, b: MovieItem) => {
            // Create date objects, fallback to a very old date if invalid/missing
            const dateA = a.release_date ? new Date(a.release_date) : new Date(0);
            const dateB = b.release_date ? new Date(b.release_date) : new Date(0);

            // Handle invalid dates gracefully
            if (isNaN(dateA.getTime())) return 1;
            if (isNaN(dateB.getTime())) return -1;
            
            return dateA.getTime() - dateB.getTime();
        });

        setMovies(sortedData);
      } catch (err) {
        setError('Failed to load movies for this franchise.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (franchiseName) {
      fetchMovies();
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
          className="modal-content franchise-modal-content"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 50, opacity: 0 }}
        >
          <h3>{franchiseName}</h3>
          <div className="franchise-movie-list">
            {loading && <p>Loading movies...</p>}
            {error && <p className="modal-error">{error}</p>}
            {!loading && !error && (
              <ul>
                {movies.map((movie) => (
                  <li key={movie.row_index}>
                    <span className={`movie-watched-status ${movie.watched_till.toLowerCase() !== 'not watched' ? 'watched' : 'not-watched'}`}>
                      ●
                    </span>
                    <span className="movie-title">{movie.movies_name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="modal-actions">
            <button className="modal-button secondary" onClick={onClose}>Close</button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};