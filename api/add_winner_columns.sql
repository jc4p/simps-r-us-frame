-- Add winner columns to auctions table to track who won settled auctions

ALTER TABLE auctions 
ADD COLUMN IF NOT EXISTS winner_address VARCHAR(42),
ADD COLUMN IF NOT EXISTS winner_fid INTEGER,
ADD COLUMN IF NOT EXISTS winning_bid NUMERIC(78, 0);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_auctions_winner_fid ON auctions(winner_fid) WHERE winner_fid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auctions_winning_bid ON auctions(winning_bid DESC) WHERE winning_bid IS NOT NULL;

-- Composite index for top winning casts query
CREATE INDEX IF NOT EXISTS idx_auctions_state_winning_bid ON auctions(state, winning_bid DESC) WHERE state = 3;