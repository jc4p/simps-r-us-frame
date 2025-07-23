-- PostgreSQL schema for NFT bidding tracker

-- Create auctions table
CREATE TABLE IF NOT EXISTS auctions (
    id SERIAL PRIMARY KEY,
    cast_hash VARCHAR(66) UNIQUE NOT NULL,
    creator_address VARCHAR(42) NOT NULL,
    creator_fid INTEGER NOT NULL,
    min_bid NUMERIC(78, 0) NOT NULL,
    min_bid_increment_bps INTEGER NOT NULL,
    protocol_fee_bps INTEGER NOT NULL,
    duration INTEGER NOT NULL,
    extension INTEGER NOT NULL,
    extension_threshold INTEGER NOT NULL,
    end_time TIMESTAMP NOT NULL,
    transaction_hash VARCHAR(66) NOT NULL,
    block_number BIGINT NOT NULL,
    authorizer VARCHAR(42) NOT NULL,
    state INTEGER DEFAULT 1, -- 0=None, 1=Active, 2=Ended, 3=Settled, 4=Cancelled, 5=Recovered
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create bids table
CREATE TABLE IF NOT EXISTS bids (
    id SERIAL PRIMARY KEY,
    auction_id INTEGER REFERENCES auctions(id) ON DELETE CASCADE,
    cast_hash VARCHAR(66) NOT NULL,
    bidder_address VARCHAR(42) NOT NULL,
    bidder_fid INTEGER NOT NULL,
    amount NUMERIC(78, 0) NOT NULL,
    transaction_hash VARCHAR(66) NOT NULL,
    block_number BIGINT NOT NULL,
    authorizer VARCHAR(42) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create sync_status table to track last synced block
CREATE TABLE IF NOT EXISTS sync_status (
    id INTEGER PRIMARY KEY DEFAULT 1,
    last_block_number BIGINT NOT NULL DEFAULT 0,
    last_sync_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT single_row CHECK (id = 1)
);

-- Insert initial sync status
INSERT INTO sync_status (id, last_block_number) 
VALUES (1, 0) 
ON CONFLICT (id) DO NOTHING;

-- Indexes for performance
CREATE INDEX idx_auctions_cast_hash ON auctions(cast_hash);
CREATE INDEX idx_auctions_creator_fid ON auctions(creator_fid);
CREATE INDEX idx_auctions_end_time ON auctions(end_time);
CREATE INDEX idx_auctions_block_number ON auctions(block_number);
CREATE INDEX idx_auctions_state ON auctions(state);

CREATE INDEX idx_bids_cast_hash ON bids(cast_hash);
CREATE INDEX idx_bids_bidder_fid ON bids(bidder_fid);
CREATE INDEX idx_bids_timestamp ON bids(timestamp);
CREATE INDEX idx_bids_amount ON bids(amount);
CREATE INDEX idx_bids_auction_id ON bids(auction_id);
CREATE INDEX idx_bids_block_number ON bids(block_number);

-- Composite indexes for common queries
CREATE INDEX idx_bids_auction_amount ON bids(auction_id, amount DESC);
CREATE INDEX idx_bids_bidder_timestamp ON bids(bidder_fid, timestamp DESC);
CREATE INDEX idx_auctions_state_endtime ON auctions(state, end_time);