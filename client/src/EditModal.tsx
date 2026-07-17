/* client/src/EditModal.tsx */
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

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

      await axios.put(`${API_BASE}/update-media`, payload);
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
           await axios.put(`${API_BASE}/update-media`, payload);
           onUpdate();
      } catch (err: any) {
          setError(err.response?.data?.error || "Failed to update status.");
      } finally {
          setLoading(false);
      }
  };

  return (
    <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="modal-content" initial={{ y: 50, scale: 0.95, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 50, scale: 0.95, opacity: 0 }}>
        <h3 className="modal-title">Edit Entry</h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="input-group">
            <label htmlFor="name">Title</label>
            <input id="name" type="text" value={name} onChange={e => setName(e.target.value)} className="premium-input" />
          </div>

          {isSeries ? (
            <div className="input-group" style={{ flexDirection: 'row', gap: '1rem' }}>
                <div className="input-group" style={{ minWidth: '80px' }}>
                    <label>Season</label>
                    <input type="number" value={season} onChange={e => setSeason(parseInt(e.target.value,10) || 1)} className="premium-input" style={{ textAlign: 'center' }} />
                </div>
                <div className="input-group" style={{ minWidth: '80px' }}>
                    <label>Episode</label>
                    <input type="number" value={episode} onChange={e => setEpisode(parseInt(e.target.value,10) || 0)} className="premium-input" style={{ textAlign: 'center' }} />
                </div>
            </div>
          ) : (
             <div className="input-group" style={{ flexDirection: 'row', gap: '1rem', marginTop: '0.5rem' }}>
                <button type="button" className="premium-button" onClick={() => handleMovieWatchedStatusUpdate('True')} disabled={item.watched === 'True' || loading} style={{ flex: 1, background: 'var(--status-success)', boxShadow: '0 0 15px rgba(16, 185, 129, 0.4)' }}>Watched</button>
                <button type="button" className="premium-button" onClick={() => handleMovieWatchedStatusUpdate('False')} disabled={item.watched === 'False' || loading} style={{ flex: 1, background: 'var(--status-warning)', boxShadow: '0 0 15px rgba(245, 158, 11, 0.4)' }}>Not Watched</button>
             </div>
          )}

          {error && <p className="error-state" style={{ padding: '0.5rem', margin: 0 }}>{error}</p>}
          
          <div className="modal-actions" style={{ marginTop: '1rem' }}>
            <button type="button" className="premium-button secondary" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="premium-button" disabled={loading}>{loading ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};