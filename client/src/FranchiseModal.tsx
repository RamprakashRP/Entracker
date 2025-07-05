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
        const sortedData = (response.data.data || []).sort((a: MovieItem, b: MovieItem) => {
            const dateA = a.expected_on && a.expected_on !== 'N/A' ? new Date(a.expected_on) : null;
            const dateB = b.expected_on && b.expected_on !== 'N/A' ? new Date(b.expected_on) : null;
            if (dateA && dateB) return dateA.getTime() - dateB.getTime();
            return a.movies_name.localeCompare(b.movies_name);
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