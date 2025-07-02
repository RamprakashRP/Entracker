/* client/src/MediaListView.tsx */
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';

// Media types for the list view filters, matching backend SHEET_CONFIG keys
type ListMediaType = "series" | "movie" | "anime" | "anime_movie";

// Map for display labels
const listViewLabels: Record<ListMediaType, string> = {
  series: "TV Series",
  movie: "Movie",
  anime: "Anime Series",
  anime_movie: "Anime Movie",
};

// Define a type for fetched media items
interface FetchedMediaItem {
    series_name?: string;
    movies_name?: string;
    anime_name?: string;
    row_index: number;
    series_status?: string;
    season_status?: string;
    watched_till?: string;
    next_season?: string;
    next_part?: string;
    expected_on?: string;
    update?: string;
    media_type_key: ListMediaType; // To identify original type from backend
    [key: string]: any; // For any other properties
}


const MediaListView: React.FC = () => {
  const [selectedListType, setSelectedListType] = useState<ListMediaType>('series'); // Default to series list
  const [mediaList, setMediaList] = useState<FetchedMediaItem[]>([]); // State to hold fetched data
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Function to fetch data
  const fetchMediaList = async (mediaType: ListMediaType) => {
    setLoadingList(true);
    setListError(null);
    setMediaList([]); // Clear previous list
    try {
      const response = await axios.get(`http://localhost:5000/get-media/${mediaType}`);
      // Add media_type_key to each item for consistent display
      const typedData = response.data.data.map((item: any) => ({
          ...item,
          media_type_key: mediaType 
      }));
      setMediaList(typedData);
      console.log(`Fetched list for ${mediaType}:`, typedData);
    } catch (err: any) {
      setListError(err.response?.data?.error || "Failed to load list. Please try again.");
      console.error(`Error fetching list for ${mediaType}:`, err);
    } finally {
      setLoadingList(false);
    }
  };

  // Trigger fetch when selected type changes
  useEffect(() => {
    fetchMediaList(selectedListType);
  }, [selectedListType]);


  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="media-list-view"
    >
      <h2 className="list-view-title">Your Tracked Media</h2>
      
      <div className="list-filter-buttons">
        {Object.entries(listViewLabels).map(([key, label]) => (
          <button
            key={key}
            className={`list-filter-button ${selectedListType === key ? 'active' : ''}`}
            onClick={() => setSelectedListType(key as ListMediaType)}
            disabled={loadingList}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="media-list-content"> {/* Changed from placeholder to content */}
        {loadingList && <p className="loading-message">Loading {listViewLabels[selectedListType]}...</p>}
        {listError && <p className="list-error-message">{listError}</p>}
        
        {!loadingList && !listError && mediaList.length === 0 && (
          <p className="no-data-message">No {listViewLabels[selectedListType]} found. Add some!</p>
        )}

        {/* --- Render Table Here --- */}
        {!loadingList && !listError && mediaList.length > 0 && (
          <div className="media-table-container">
            <table>
              <thead>
                <tr>
                  {/* Dynamically render headers based on selectedListType or a common set */}
                  {selectedListType === 'series' || selectedListType === 'anime' ? (
                    <>
                      <th>Name</th>
                      <th>Series Status</th>
                      <th>Season Status</th>
                      <th>Watched Till</th>
                      <th>Next Season</th>
                      <th>Expected On</th>
                      <th>Updated</th>
                    </>
                  ) : (
                    <>
                      <th>Name</th>
                      <th>Franchise Status</th>
                      <th>Watched Till</th>
                      <th>Next Part</th>
                      <th>Expected On</th>
                      <th>Updated</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {mediaList.map((item) => (
                  <tr key={item.row_index}>
                    {selectedListType === 'series' || selectedListType === 'anime' ? (
                      <>
                        <td>{item.series_name || item.anime_name}</td>
                        <td>{item.series_status}</td>
                        <td>{item.season_status}</td>
                        <td>{item.watched_till}</td>
                        <td>{item.next_season}</td>
                        <td>{item.expected_on}</td>
                        <td>{item.update ? new Date(item.update).toLocaleDateString() : 'N/A'}</td>
                      </>
                    ) : (
                      <>
                        <td>{item.movies_name}</td>
                        <td>{item.franchise_status}</td>
                        <td>{item.watched_till}</td>
                        <td>{item.next_part}</td>
                        <td>{item.expected_on}</td>
                        <td>{item.update ? new Date(item.update).toLocaleDateString() : 'N/A'}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default MediaListView;