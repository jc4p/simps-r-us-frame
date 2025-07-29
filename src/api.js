// API wrapper for Simps R Us backend
const API_BASE = 'https://simps-api.kasra.codes';

// Helper function for API calls with error handling
async function fetchAPI(endpoint) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

export const api = {
  baseUrl: API_BASE,
  
  // Get top simps (main leaderboard)
  getTopSimps: (limit = 50) => 
    fetchAPI(`/analytics/top-bidders?limit=${limit}`),
  
  // Get top simps by time period
  getTopSimpsByTimeframe: (period = 'all-time', limit = 30) => 
    fetchAPI(`/analytics/top-bidders/timeframe?period=${period}&limit=${limit}`),
  
  // Get hot casts (most simped on)
  getHotCasts: (limit = 20) => 
    fetchAPI(`/analytics/hot-casts?limit=${limit}`),
  
  // Get hot users (creators with most revenue)
  getHotUsers: (limit = 30) => 
    fetchAPI(`/analytics/hot-users?limit=${limit}`),
  
  // Get global statistics
  getStats: () => 
    fetchAPI('/analytics/stats'),
  
  // Get trending data (hot auctions and rising simps)
  getTrending: () => 
    fetchAPI('/analytics/trending'),
  
  // Compare two simps head-to-head
  getSimpBattle: (fid1, fid2) => 
    fetchAPI(`/analytics/simp-battles?fid1=${fid1}&fid2=${fid2}`),
  
  // Get simp level and achievements for a user
  getSimpLevel: (fid) => 
    fetchAPI(`/analytics/simp-level/${fid}`),
  
  // Get detailed user profile
  getUserProfile: (fid) => 
    fetchAPI(`/analytics/user/${fid}`),
  
  // Get specific auction details
  getAuction: (castHash) => 
    fetchAPI(`/auctions/${castHash}`),
  
  // Get creator statistics
  getCreatorStats: (fid) => 
    fetchAPI(`/analytics/creator-stats/${fid}`),
  
  // Get outbid history (rivalries)
  getOutbidHistory: (fid) => 
    fetchAPI(`/analytics/outbid-history/${fid}`),
  
  // Get hall of shame profile (consolidated endpoint)
  getHallOfShameProfile: (fid) => 
    fetchAPI(`/analytics/hall-of-shame/${fid}`),
  
  // Get top winning casts (highest winning bids)
  getTopWinningCasts: (limit = 30, offset = 0) => 
    fetchAPI(`/analytics/top-winning-casts?limit=${limit}&offset=${offset}`),
  
  // Get top collectors (most active collectors)
  getTopCollectors: (limit = 30) => 
    fetchAPI(`/analytics/top-collectors?limit=${limit}`),
  
  // Get top collected creators (most collected casters)
  getTopCollectedCreators: (limit = 30) => 
    fetchAPI(`/analytics/top-collected-creators?limit=${limit}`),
};