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
      <motion.div className="modal-content" initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}>
        <h3>Did you mean...?</h3>
        <ul className="disambiguation-list">
          {results.map(result => (
            <li key={result.id}>
              <span className="disambiguation-title" onClick={() => onViewDetails(result)}>
                {result.name} ({result.release_date?.split('-')[0] || 'N/A'})
              </span>
              <button className="select-button" onClick={() => onSelect(result)}>✔️</button>
            </li>
          ))}
        </ul>
        <div className="modal-actions">
            <button className="modal-button secondary" onClick={onClose}>Cancel</button>
        </div>
      </motion.div>
    </motion.div>
  );
};