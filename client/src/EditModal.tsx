/* client/src/EditModal.tsx */
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';

// Interface for the media item being edited
interface FetchedMediaItem {
    series_name?: string;
    movies_name?: string;
    anime_name?: string;
    row_index: number;
    watched_till?: string;
    media_type_key: "series" | "movie" | "anime" | "anime_movie";
    [key: string]: any;
}

// Props for the EditModal component
interface EditModalProps {
    item: FetchedMediaItem;
    onClose: () => void;
    onUpdate: () => void; // Callback to refresh the list after a successful update
}

export const EditModal: React.FC<EditModalProps> = ({ item, onClose, onUpdate }) => {
    // State for the form fields
    const [name, setName] = useState(item.series_name || item.movies_name || item.anime_name || '');
    const [season, setSeason] = useState<string>('');
    const [episode, setEpisode] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Effect to parse the initial season and episode numbers from the 'watched_till' string
    useEffect(() => {
        if (item.watched_till && (item.media_type_key === 'series' || item.media_type_key === 'anime')) {
            const seasonMatch = item.watched_till.match(/S(\d+)/);
            const episodeMatch = item.watched_till.match(/E(\d+)/);
            setSeason(seasonMatch ? seasonMatch[1].replace(/^0+/, '') : '1');
            setEpisode(episodeMatch ? episodeMatch[1].replace(/^0+/, '') : '0');
        }
    }, [item]);

    // Function to handle the form submission for updating the media
    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        let watchedTillForBackend = "";
        // Format watchedTill string only for series and anime
        if (item.media_type_key === "series" || item.media_type_key === "anime") {
            const sNum = parseInt(season, 10);
            if (!season || isNaN(sNum) || sNum <= 0) {
                setError("Season number must be a positive number.");
                setLoading(false);
                return;
            }
            const eNum = parseInt(episode, 10);
            watchedTillForBackend = `S${String(sNum).padStart(2, '0')}`;
            if (episode && !isNaN(eNum) && eNum >= 0) {
                watchedTillForBackend += ` E${String(eNum).padStart(2, '0')}`;
            }
        }

        try {
            // Send the update request to the backend
            // The backend uses the same '/add-media' endpoint for both add and update, differentiating by the presence of rowIndex
            await axios.put("http://localhost:5000/add-media", {
                mediaType: item.media_type_key,
                mediaName: name,
                watchedTill: watchedTillForBackend,
                rowIndex: item.row_index,
            });
            onUpdate(); // Trigger list refresh in the parent component
            onClose();  // Close the modal
        } catch (err: any) {
            setError(err.response?.data?.error || "Failed to update. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    // Helper to increment/decrement number inputs
    const updateNumberInput = (setter: React.Dispatch<React.SetStateAction<string>>, delta: number, min: number) => {
        setter(prev => {
            const currentVal = parseInt(prev || String(min), 10);
            let newVal = currentVal + delta;
            if (newVal < min) newVal = min;
            return newVal.toString();
        });
    };

    const isSeries = item.media_type_key === 'series' || item.media_type_key === 'anime';

    return (
        <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="modal-content" initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -50, opacity: 0 }}>
                <h3>Edit Media</h3>
                <form onSubmit={handleUpdate} className="modal-form">
                    <div className="form-group">
                        <label>Name</label>
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="modal-input" />
                    </div>
                    {isSeries && (
                        <div className="form-group">
                            <label>Watched Till</label>
                            <div className="modal-watched-till-group">
                                <label>Season:</label>
                                <div className="watched-till-input-container">
                                    <button type="button" className="spin-button" onClick={() => updateNumberInput(setSeason, -1, 1)}>-</button>
                                    <input type="number" value={season} onChange={(e) => setSeason(e.target.value)} min="1" className="watched-till-input-short" required/>
                                    <button type="button" className="spin-button" onClick={() => updateNumberInput(setSeason, 1, 1)}>+</button>
                                </div>
                                <label>Episode:</label>
                                <div className="watched-till-input-container">
                                    <button type="button" className="spin-button" onClick={() => updateNumberInput(setEpisode, -1, 0)}>-</button>
                                    <input type="number" value={episode} onChange={(e) => setEpisode(e.target.value)} min="0" className="watched-till-input-short" />
                                    <button type="button" className="spin-button" onClick={() => updateNumberInput(setEpisode, 1, 0)}>+</button>
                                </div>
                            </div>
                        </div>
                    )}
                    {error && <p className="modal-error">{error}</p>}
                    <div className="modal-actions">
                        <button type="button" className="modal-button secondary" onClick={onClose} disabled={loading}>Cancel</button>
                        <button type="submit" className="modal-button primary" disabled={loading}>
                            {loading ? "Saving..." : "Save Changes"}
                        </button>
                    </div>
                </form>
            </motion.div>
        </motion.div>
    );
};