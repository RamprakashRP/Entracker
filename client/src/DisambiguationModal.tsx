/* client/src/DisambiguationModal.tsx */
import React from 'react';
import { motion } from 'framer-motion';

export interface TMDBResult {
  id: number;
  name: string;
  release_date: string;
}

interface DisambiguationModalProps {
  results: TMDBResult[];
  onSelect: (result: TMDBResult) => void;
  onViewDetails: (result: TMDBResult) => void;
  onClose: () => void;
}

export const DisambiguationModal: React.FC<DisambiguationModalProps> = ({ results, onSelect, onViewDetails, onClose }) => {
  return (
    <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="modal-content" initial={{ y: 50, scale: 0.95, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 50, scale: 0.95, opacity: 0 }}>
        <h3 className="modal-title">Did you mean...?</h3>
        <ul className="suggestions-list" style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '400px', overflowY: 'auto', boxShadow: 'none' }}>
          {results.map(result => (
            <li key={result.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="franchise-link" onClick={() => onViewDetails(result)}>
                {result.name} ({result.release_date?.split('-')[0] || 'N/A'})
              </span>
              <button className="premium-button" style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }} onClick={() => onSelect(result)}>Select</button>
            </li>
          ))}
        </ul>
        <div className="modal-actions">
            <button className="premium-button secondary" onClick={onClose}>Cancel</button>
        </div>
      </motion.div>
    </motion.div>
  );
};