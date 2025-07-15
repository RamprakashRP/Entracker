/* client/src/EditModal.tsx */
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';

interface MediaItem {
  row_index: number;
  media_type_key: 'series' | 'movie' | 'anime' | 'anime_movie';
  [key: string]: any;
}

interface EditModalProps {
  item: MediaItem;
  onClose: () => void;
  onUpdate: () => void;
}

export const EditModal: React.FC<EditModalProps> = ({ item, onClose, onUpdate }) => {
  const API_URL = import.meta.env.VITE_API_BASE_URL;
  const isSeries = item.media_type_key === 'series' || item.media_type_key === 'anime';
  const nameKey = isSeries ? `${item.media_type_key}_name` : 'movies_name';

  const [name, setName] = useState(item[nameKey] || '');
  const [season, setSeason] = useState(parseInt(item.watched_till?.match(/S(\d+)/)?.[1] || '1', 10));
  const [episode, setEpisode] = useState(parseInt(item.watched_till?.match(/E(\d+)/)?.[1] || '0', 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateNumberInput = (field: 'season' | 'episode', delta: number) => {
      if(field === 'season') {
          setSeason(prev => Math.max(1, prev + delta));
      } else {
          setEpisode(prev => Math.max(0, prev + delta));
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      let watchedTill = '';
      if (isSeries) {
        watchedTill = `S${String(season).padStart(2, '0')} E${String(episode).padStart(2, '0')}`;
      }
      
      const payload = {
        rowIndex: item.row_index,
        mediaType: item.media_type_key,
        watchedTill: watchedTill,
        name: name,
      };

      await axios.put(`${API_URL}/update-media`, payload);
      onUpdate();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to update.");
    } finally {
      setLoading(false);
    }
  };
  
  const handleMovieWatchedStatusUpdate = async (newStatus: 'True' | 'False') => {
      setLoading(true);
      setError(null);
      try {
           const payload = {
              rowIndex: item.row_index,
              mediaType: item.media_type_key,
              watched: newStatus,
              name: name
           };
           await axios.put(`${API_URL}/update-media`, payload);
           onUpdate();
      } catch (err: any) {
          setError(err.response?.data?.error || "Failed to update status.");
      } finally {
          setLoading(false);
      }
  };

  return (
    <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="modal-content" initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}>
        <h3>Edit Entry</h3>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="name">Name:</label>
            <input id="name" type="text" value={name} onChange={e => setName(e.target.value)} className="modal-input" />
          </div>

          {isSeries ? (
            <div className="watched-till-group">
                <label>Season:</label>
                <div className="watched-till-input-container">
                    <button type="button" className="spin-button" onClick={() => updateNumberInput('season', -1)} disabled={season <= 1}>-</button>
                    <input type="number" value={season} onChange={e => setSeason(parseInt(e.target.value,10) || 1)} className="watched-till-input-short" />
                    <button type="button" className="spin-button" onClick={() => updateNumberInput('season', 1)}>+</button>
                </div>
                <label>Episode:</label>
                <div className="watched-till-input-container">
                    <button type="button" className="spin-button" onClick={() => updateNumberInput('episode', -1)} disabled={episode <= 0}>-</button>
                    <input type="number" value={episode} onChange={e => setEpisode(parseInt(e.target.value,10) || 0)} className="watched-till-input-short" />
                    <button type="button" className="spin-button" onClick={() => updateNumberInput('episode', 1)}>+</button>
                </div>
            </div>
          ) : (
             <div className="modal-actions">
                <button type="button" className="modal-button" onClick={() => handleMovieWatchedStatusUpdate('True')} disabled={item.watched === 'True' || loading}>Mark as Watched</button>
                <button type="button" className="modal-button secondary" onClick={() => handleMovieWatchedStatusUpdate('False')} disabled={item.watched === 'False' || loading}>Mark as Not Watched</button>
             </div>
          )}

          {error && <p className="modal-error">{error}</p>}
          
          <div className="modal-actions">
            <button type="button" className="modal-button secondary" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="modal-button primary" disabled={loading}>{loading ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};