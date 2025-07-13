/* client/src/ConfirmationModal.tsx */
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "Yes",
  cancelText = "No"
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
        <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            <motion.div
                className="modal-content"
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 50, opacity: 0 }}
            >
                <h3>{title}</h3>
                <p style={{ lineHeight: 1.6, margin: '1rem 0 1.5rem 0' }}>{message}</p>
                <div className="modal-actions">
                    <button className="modal-button secondary" onClick={onCancel}>{cancelText}</button>
                    <button className="modal-button primary" onClick={onConfirm}>{confirmText}</button>
                </div>
            </motion.div>
        </motion.div>
    </AnimatePresence>
  );
};