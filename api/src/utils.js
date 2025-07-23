// Utility function to format cast hashes from bytes32 to bytes20
export function formatCastHash(castHash) {
  // Remove 0x prefix if present
  const cleanHash = castHash.startsWith('0x') ? castHash.slice(2) : castHash;
  
  // Take the last 40 characters (20 bytes) - this removes the leading zeros padding
  const bytes20 = cleanHash.slice(-40);
  
  // Add 0x prefix back
  return '0x' + bytes20;
}

// Function to pad cast hash from bytes20 to bytes32 for contract calls
export function padCastHash(castHash) {
  // Remove 0x prefix if present
  const cleanHash = castHash.startsWith('0x') ? castHash.slice(2) : castHash;
  
  // Pad to 64 characters (32 bytes) with leading zeros
  const padded = cleanHash.padStart(64, '0');
  
  // Add 0x prefix back
  return '0x' + padded;
}

// Convert USDC amount (6 decimals) to cents
export function usdcToCents(amount) {
  if (!amount) return 0;
  // Convert from 6 decimals to cents (2 decimals)
  // 1 USDC = 1,000,000 units = 100 cents
  return Math.round(Number(amount) / 10000);
}