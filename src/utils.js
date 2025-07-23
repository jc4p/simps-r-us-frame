// Utility functions for Simps R Us

// Format cents to USD currency with dramatic flair
export function formatUSDC(cents) {
  if (!cents || cents === 0) return '$0.00';
  
  const value = cents / 100;
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
  
  // Add dramatic emphasis for large amounts
  if (value >= 1000) {
    return `${formatted} 💸`;
  }
  return formatted;
}

// Get simp level based on total bids with tabloid-style names
export function getSimpLevel(totalBids) {
  if (totalBids >= 100) return { 
    level: 'GIGA SIMP', 
    emoji: '👑', 
    headline: 'ROYALTY STATUS!',
    color: '#000000' // Black
  };
  if (totalBids >= 50) return { 
    level: 'MEGA SIMP', 
    emoji: '🔥', 
    headline: 'ON FIRE!',
    color: '#333333' // Dark Gray
  };
  if (totalBids >= 20) return { 
    level: 'SUPER SIMP', 
    emoji: '💪', 
    headline: 'POWER PLAYER!',
    color: '#666666' // Medium Gray
  };
  if (totalBids >= 10) return { 
    level: 'SIMP PRO', 
    emoji: '⭐', 
    headline: 'RISING STAR!',
    color: '#999999' // Light Gray
  };
  if (totalBids >= 5) return { 
    level: 'SIMP', 
    emoji: '💖', 
    headline: 'IN THE GAME!',
    color: '#CCCCCC' // Lighter Gray
  };
  return { 
    level: 'SIMP ROOKIE', 
    emoji: '🌱', 
    headline: 'FRESH MEAT!',
    color: '#999999' // Light Gray
  };
}

// Format large numbers with K/M suffixes for headlines
export function formatBigNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

// Get dramatic headline for bid amounts
export function getBidHeadline(amountCents) {
  const dollars = amountCents / 100;
  
  if (dollars >= 1000) return "WHALE ALERT! 🐋";
  if (dollars >= 500) return "BIG SPENDER SPOTTED!";
  if (dollars >= 100) return "SERIOUS SIMP ENERGY!";
  if (dollars >= 50) return "MAKING IT RAIN!";
  return "CAUGHT SIMPING!";
}

// Format time ago in tabloid style
export function formatTimeAgo(timestamp) {
  const now = new Date();
  const time = new Date(timestamp);
  const seconds = Math.floor((now - time) / 1000);
  
  if (seconds < 60) return "JUST NOW!";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}M AGO`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}H AGO`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}D AGO`;
  return time.toLocaleDateString();
}

// Get auction status with dramatic flair
export function getAuctionStatus(state, endTime) {
  const now = new Date();
  const end = new Date(endTime);
  
  switch(state) {
    case 1: // Active
      if (end - now < 3600000) { // Less than 1 hour
        return { text: "ENDING SOON!", color: "#FF0000", pulse: true };
      }
      return { text: "BIDDING WAR!", color: "#00FF00", pulse: false };
    case 2: // Ended
      return { text: "SOLD!", color: "#FFD700", pulse: false };
    case 3: // Settled
      return { text: "HISTORY!", color: "#808080", pulse: false };
    default:
      return { text: "UNKNOWN", color: "#808080", pulse: false };
  }
}

// Get dramatic comparison result
export function getBattleResult(user1Stats, user2Stats) {
  const score1 = parseInt(user1Stats.total_bids);
  const score2 = parseInt(user2Stats.total_bids);
  
  if (score1 > score2 * 2) return "TOTAL DOMINATION!";
  if (score1 > score2 * 1.5) return "CLEAR WINNER!";
  if (score1 > score2) return "VICTORY!";
  if (score1 === score2) return "IT'S A TIE!";
  return "DEFEATED!";
}

// Format percentage with drama
export function formatPercentage(value) {
  const formatted = value.toFixed(1);
  if (value >= 100) return `+${formatted}% 🚀`;
  if (value >= 50) return `+${formatted}% 📈`;
  if (value >= 0) return `+${formatted}%`;
  return `${formatted}%`;
}

// Get random gossip tagline
export function getRandomTagline() {
  const taglines = [
    "YOU WON'T BELIEVE WHO'S SIMPING!",
    "EXCLUSIVE: THE TRUTH REVEALED!",
    "SCANDAL IN THE FARCASTER SCENE!",
    "SHOCKING BIDDING BEHAVIOR EXPOSED!",
    "THE SIMPS YOU NEED TO KNOW!",
    "BREAKING: NEW SIMP ALERT!",
    "WHO'S THE BIGGEST SIMP? FIND OUT!",
    "DRAMA ALERT: BIDDING WARS HEAT UP!"
  ];
  return taglines[Math.floor(Math.random() * taglines.length)];
}

// Truncate address for display
export function truncateAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Parse FID from username input (handles @username or just number)
export function parseFid(input) {
  if (!input) return null;
  
  // Remove @ if present
  const cleaned = input.replace('@', '').trim();
  
  // If it's a number, return it
  const fid = parseInt(cleaned);
  if (!isNaN(fid)) return fid;
  
  // Otherwise, we'd need to look up the username
  // For now, return null and handle in the component
  return null;
}