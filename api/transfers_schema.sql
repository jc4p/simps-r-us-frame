-- Schema for tracking NFT Transfer events for peer-to-peer trading

-- Create transfers table to store all Transfer events
CREATE TABLE IF NOT EXISTS transfers (
    id SERIAL PRIMARY KEY,
    from_address VARCHAR(42) NOT NULL,
    to_address VARCHAR(42) NOT NULL,
    token_id VARCHAR(78) NOT NULL,
    transaction_hash VARCHAR(66) NOT NULL,
    block_number BIGINT NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    is_p2p BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_transfers_timestamp ON transfers(timestamp DESC);
CREATE INDEX idx_transfers_token_id ON transfers(token_id);
CREATE INDEX idx_transfers_from_address ON transfers(from_address);
CREATE INDEX idx_transfers_to_address ON transfers(to_address);
CREATE INDEX idx_transfers_is_p2p ON transfers(is_p2p);
CREATE INDEX idx_transfers_block_number ON transfers(block_number);

-- Composite index for P2P transfers query
CREATE INDEX idx_transfers_p2p_timestamp ON transfers(is_p2p, timestamp DESC) WHERE is_p2p = true;

-- Unique constraint to prevent duplicate transfers
CREATE UNIQUE INDEX idx_transfers_unique ON transfers(transaction_hash, token_id);

-- Track NFT contract sync status separately
CREATE TABLE IF NOT EXISTS nft_sync_status (
    id INTEGER PRIMARY KEY DEFAULT 1,
    last_block_number BIGINT NOT NULL DEFAULT 0,
    last_sync_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT single_row CHECK (id = 1)
);

-- Insert initial sync status for NFT contract
INSERT INTO nft_sync_status (id, last_block_number) 
VALUES (1, 0) 
ON CONFLICT (id) DO NOTHING;