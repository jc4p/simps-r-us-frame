-- Performance optimization indexes for hot routes
-- Run this in your Neon DB to improve query performance
-- Created: 2025-07-23

-- =====================================================
-- IMPORTANT: Using CONCURRENTLY to avoid locking tables
-- This allows indexes to be built without blocking writes
-- =====================================================

-- Hot-users route optimization
-- This composite index helps with creator revenue calculations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_auctions_creator_state_id 
ON auctions(creator_fid, state, id);

-- Helps with finding max bids per auction efficiently
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bids_auction_amount_bidder 
ON bids(auction_id, amount DESC, bidder_fid);

-- Hot-casts route optimization
-- Composite index for aggregation queries with bidder stats
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bids_auction_bidder_amount_timestamp 
ON bids(auction_id, bidder_fid, amount, timestamp);

-- Additional index for hot-casts top bidders subquery
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bids_auction_amount_desc 
ON bids(auction_id, amount DESC);

-- Hall-of-shame route optimization
-- User-specific queries need bidder_fid first
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bids_bidder_auction_amount_timestamp 
ON bids(bidder_fid, auction_id, amount DESC, timestamp);

-- For user stats calculations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bids_bidder_amount 
ON bids(bidder_fid, amount DESC);

-- Time-based query optimization
-- Many queries filter by recent timestamps
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bids_timestamp_desc 
ON bids(timestamp DESC);

-- For queries that sort auctions by creation time
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_auctions_created_at_desc 
ON auctions(created_at DESC) WHERE state IN (1, 2, 3);

-- Partial indexes for common filters
-- Active auctions are frequently queried
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_auctions_active 
ON auctions(state, end_time) WHERE state = 1;

-- Settled auctions for revenue calculations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_auctions_settled 
ON auctions(creator_fid, state) WHERE state >= 3;

-- Covering index for hot aggregations
-- INCLUDE clause stores extra columns in the index for index-only scans
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bids_covering_aggregates 
ON bids(auction_id, bidder_fid, amount) INCLUDE (timestamp);

-- For outbid tracking queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bids_auction_timestamp_asc 
ON bids(auction_id, timestamp ASC, amount);

-- Composite index for ranking queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bids_bidder_auction_covering 
ON bids(bidder_fid, auction_id) INCLUDE (amount, timestamp);

-- For recent activity queries with joins
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bids_timestamp_auction 
ON bids(timestamp DESC, auction_id);

-- Hot users revenue tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_auctions_creator_created 
ON auctions(creator_fid, created_at DESC);

-- =====================================================
-- Update table statistics for query planner
-- This helps PostgreSQL choose optimal query plans
-- =====================================================

ANALYZE auctions;
ANALYZE bids;

-- =====================================================
-- Optional: Check index usage after running for a while
-- =====================================================
-- SELECT 
--     schemaname,
--     tablename,
--     indexname,
--     idx_scan,
--     idx_tup_read,
--     idx_tup_fetch
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public'
-- ORDER BY idx_scan DESC;