-- Indexes for optimizing query performance

-- Bids table indexes
CREATE INDEX IF NOT EXISTS idx_bids_bidder_fid ON bids(bidder_fid);
CREATE INDEX IF NOT EXISTS idx_bids_auction_id ON bids(auction_id);
CREATE INDEX IF NOT EXISTS idx_bids_bidder_auction ON bids(bidder_fid, auction_id);
CREATE INDEX IF NOT EXISTS idx_bids_timestamp ON bids(timestamp);
CREATE INDEX IF NOT EXISTS idx_bids_amount ON bids(amount DESC);
CREATE INDEX IF NOT EXISTS idx_bids_bidder_timestamp ON bids(bidder_fid, timestamp);

-- Composite index for top bidders query
CREATE INDEX IF NOT EXISTS idx_bids_bidder_auction_amount ON bids(bidder_fid, auction_id, amount DESC);

-- Auctions table indexes
CREATE INDEX IF NOT EXISTS idx_auctions_creator_fid ON auctions(creator_fid);
CREATE INDEX IF NOT EXISTS idx_auctions_state ON auctions(state);
CREATE INDEX IF NOT EXISTS idx_auctions_created_at ON auctions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auctions_cast_hash ON auctions(cast_hash);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_auctions_creator_state ON auctions(creator_fid, state);
CREATE INDEX IF NOT EXISTS idx_auctions_state_created ON auctions(state, created_at DESC);

-- For time-based queries
CREATE INDEX IF NOT EXISTS idx_bids_timestamp_bidder ON bids(timestamp DESC, bidder_fid);

-- For outbid tracking
CREATE INDEX IF NOT EXISTS idx_bids_auction_timestamp ON bids(auction_id, timestamp ASC);

-- Analyze tables to update statistics
ANALYZE bids;
ANALYZE auctions;