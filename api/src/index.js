import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { quickAuthMiddleware } from './auth.js';
import { NeynarClient } from './neynar.js';
import { executeQuery } from './db.js';
import { syncEvents } from './sync.js';
import { formatCastHash, padCastHash, usdcToCents } from './utils.js';

const app = new Hono();

// Middleware to inject Neynar client with KV cache
app.use('*', async (c, next) => {
  c.set('neynarClient', new NeynarClient(c.env.NEYNAR_API_KEY, c.env.NEYNAR_CACHE));
  await next();
});

// Enable CORS
app.use(cors());

// Health check
app.get('/', (c) => {
  return c.json({ message: 'NFT Bidding Tracker API', version: '1.0.0' });
});

// Protected route - Get authenticated user info
app.get('/me', quickAuthMiddleware, async (c) => {
  const user = c.get('user');
  
  // Get user's bidding stats
  const stats = await executeQuery(
    c.env,
    `WITH max_bids_per_auction AS (
      SELECT 
        auction_id,
        MAX(amount) as max_bid_amount
      FROM bids
      WHERE bidder_fid = $1
      GROUP BY auction_id
    )
    SELECT 
      COUNT(DISTINCT b.auction_id) as auctions_participated,
      COUNT(*) as total_bids,
      MAX(b.amount) as highest_bid,
      (SELECT SUM(max_bid_amount) FROM max_bids_per_auction) as total_bid_volume
    FROM bids b
    WHERE b.bidder_fid = $1`,
    [user.fid]
  )
  
  return c.json({
    ...user,
    stats: {
      auctionsParticipated: parseInt(stats.rows[0].auctions_participated) || 0,
      totalBids: parseInt(stats.rows[0].total_bids) || 0,
      highestBidCents: usdcToCents(stats.rows[0].highest_bid),
      totalBidVolumeCents: usdcToCents(stats.rows[0].total_bid_volume)
    }
  });
});

// Public route - Get all auctions
app.get('/auctions', async (c) => {
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');
  
  const result = await executeQuery(
    c.env,
    `SELECT 
      a.*,
      COUNT(b.id) as bid_count,
      MAX(b.amount) as highest_bid
    FROM auctions a
    LEFT JOIN bids b ON a.id = b.auction_id
    GROUP BY a.id
    ORDER BY a.created_at DESC
    LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  
  // Get unique FIDs for enrichment
  const fids = [...new Set(result.rows.map(row => row.creator_fid))];
  const users = await c.get('neynarClient').getUsersByFids(fids);
  
  // Get cast content
  const castHashes = result.rows.map(row => row.cast_hash);
  const castContent = await c.get('neynarClient').getCastsByHashes(castHashes);
  
  const auctions = result.rows.map(row => ({
    id: row.id,
    cast_hash: row.cast_hash,
    creator_address: row.creator_address,
    creator_fid: row.creator_fid,
    min_bid_cents: usdcToCents(row.min_bid),
    end_time: row.end_time,
    state: row.state,
    protocol_fee_bps: row.protocol_fee_bps,
    created_at: row.created_at,
    bid_count: parseInt(row.bid_count) || 0,
    highest_bid_cents: usdcToCents(row.highest_bid),
    creatorProfile: users[row.creator_fid] || null,
    castData: castContent[row.cast_hash] || null
  }));
  
  return c.json({ auctions });
});

// Public route - Get specific auction with bids
app.get('/auctions/:castHash', async (c) => {
  const castHash = c.req.param('castHash');
  
  // Format the cast hash to match our storage format (remove padding if it's a full bytes32)
  const formattedCastHash = castHash.length > 42 ? formatCastHash(castHash) : castHash;
  
  // Get auction details
  const auctionResult = await executeQuery(
    c.env,
    'SELECT * FROM auctions WHERE cast_hash = $1',
    [formattedCastHash]
  );
  
  if (auctionResult.rows.length === 0) {
    return c.json({ error: 'Auction not found' }, 404);
  }
  
  const auction = auctionResult.rows[0];
  
  // Get all bids for this auction
  const bidsResult = await executeQuery(
    c.env,
    `SELECT * FROM bids 
     WHERE auction_id = $1 
     ORDER BY amount DESC, timestamp ASC`,
    [auction.id]
  );
  
  // Get unique FIDs for enrichment
  const fids = [
    auction.creator_fid,
    ...bidsResult.rows.map(bid => bid.bidder_fid)
  ];
  const uniqueFids = [...new Set(fids)];
  const users = await c.get('neynarClient').getUsersByFids(uniqueFids);
  
  // Get cast content
  const castData = await c.get('neynarClient').getCast(auction.cast_hash);
  
  return c.json({
    id: auction.id,
    cast_hash: auction.cast_hash,
    creator_address: auction.creator_address,
    creator_fid: auction.creator_fid,
    min_bid_cents: usdcToCents(auction.min_bid),
    end_time: auction.end_time,
    state: auction.state,
    protocol_fee_bps: auction.protocol_fee_bps,
    created_at: auction.created_at,
    creatorProfile: users[auction.creator_fid] || null,
    castData: castData,
    bids: bidsResult.rows.map(bid => ({
      id: bid.id,
      auction_id: bid.auction_id,
      bidder_address: bid.bidder_address,
      bidder_fid: bid.bidder_fid,
      amount_cents: usdcToCents(bid.amount),
      timestamp: bid.timestamp,
      transaction_hash: bid.transaction_hash,
      block_number: bid.block_number,
      bidderProfile: users[bid.bidder_fid] || null
    }))
  });
});

// Analytics route - Get hot casts (most bid on)
app.get('/analytics/hot-casts', async (c) => {
  const limit = parseInt(c.req.query('limit') || '10');
  
  const result = await executeQuery(
    c.env,
    `WITH auction_stats AS (
      SELECT 
        a.*,
        COUNT(b.id) as bid_count,
        MAX(b.amount) as highest_bid,
        MIN(b.amount) as lowest_bid,
        AVG(b.amount) as average_bid,
        COUNT(DISTINCT b.bidder_fid) as unique_bidders,
        MAX(b.timestamp) as last_bid_time,
        MIN(b.timestamp) as first_bid_time
      FROM auctions a
      LEFT JOIN bids b ON a.id = b.auction_id
      GROUP BY a.id
      HAVING COUNT(b.id) > 0
    ),
    top_bidders AS (
      SELECT 
        b.auction_id,
        b.bidder_fid,
        MAX(b.amount) as bidder_highest,
        COUNT(*) as bidder_bid_count,
        ROW_NUMBER() OVER (PARTITION BY b.auction_id ORDER BY MAX(b.amount) DESC) as rn
      FROM bids b
      GROUP BY b.auction_id, b.bidder_fid
    )
    SELECT 
      s.*,
      COALESCE(
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'bidder_fid', t.bidder_fid,
            'highest_bid', t.bidder_highest,
            'bid_count', t.bidder_bid_count
          ) ORDER BY t.rn
        ) FILTER (WHERE t.rn <= 3),
        '[]'::json
      ) as top_3_bidders
    FROM auction_stats s
    LEFT JOIN top_bidders t ON s.id = t.auction_id AND t.rn <= 3
    GROUP BY s.id, s.cast_hash, s.creator_address, s.creator_fid, s.min_bid, s.end_time,
             s.state, s.protocol_fee_bps, s.duration, s.extension, s.extension_threshold,
             s.min_bid_increment_bps, s.created_at, s.block_number,
             s.transaction_hash, s.authorizer, s.bid_count, s.highest_bid, s.lowest_bid,
             s.average_bid, s.unique_bidders, s.last_bid_time, s.first_bid_time
    ORDER BY s.highest_bid DESC, s.bid_count DESC
    LIMIT $1`,
    [limit]
  );
  
  // Get all unique FIDs (creators and top bidders)
  const creatorFids = result.rows.map(row => row.creator_fid);
  const topBidderFids = result.rows.flatMap(row => {
    // Handle top_3_bidders - it might be already parsed or need parsing
    let top3BiddersData;
    if (typeof row.top_3_bidders === 'string') {
      top3BiddersData = JSON.parse(row.top_3_bidders);
    } else if (Array.isArray(row.top_3_bidders)) {
      top3BiddersData = row.top_3_bidders;
    } else {
      top3BiddersData = [];
    }
    return top3BiddersData.map(b => b.bidder_fid);
  });
  const allFids = [...new Set([...creatorFids, ...topBidderFids])];
  
  // Get user profiles and cast content
  const castHashes = result.rows.map(row => row.cast_hash);
  const [users, castContent] = await Promise.all([
    allFids.length > 0 ? c.get('neynarClient').getUsersByFids(allFids) : {},
    castHashes.length > 0 ? c.get('neynarClient').getCastsByHashes(castHashes) : {}
  ]);
  
  const hotCasts = result.rows.map(row => {
    // Handle top_3_bidders - it might be already parsed or need parsing
    let top3BiddersData;
    if (typeof row.top_3_bidders === 'string') {
      top3BiddersData = JSON.parse(row.top_3_bidders);
    } else if (Array.isArray(row.top_3_bidders)) {
      top3BiddersData = row.top_3_bidders;
    } else {
      top3BiddersData = [];
    }
    
    const top3Bidders = top3BiddersData.map(bidder => ({
      bidderFid: bidder.bidder_fid,
      highestBidCents: usdcToCents(bidder.highest_bid),
      bidCount: parseInt(bidder.bid_count) || 0,
      profile: users[bidder.bidder_fid] || null
    }));
    
    // Calculate time-based info
    const now = new Date();
    const endTime = new Date(row.end_time);
    const isActive = row.state === 1;
    const hasEnded = endTime < now || row.state >= 2;
    const timeLeftMs = isActive && !hasEnded ? endTime - now : 0;
    
    return {
      // Auction identifiers
      id: row.id,
      castHash: row.cast_hash,
      
      // Creator info
      creatorAddress: row.creator_address,
      creatorFid: row.creator_fid,
      creatorProfile: users[row.creator_fid] || null,
      
      // Auction parameters
      minBidCents: usdcToCents(row.min_bid),
      endTime: row.end_time,
      state: row.state, // 1=Active, 2=Ended, 3=Settled
      stateLabel: row.state === 1 ? 'Active' : row.state === 2 ? 'Ended' : 'Settled',
      
      // Bidding stats
      bidCount: parseInt(row.bid_count) || 0,
      uniqueBidders: parseInt(row.unique_bidders) || 0,
      highestBidCents: usdcToCents(row.highest_bid),
      lowestBidCents: usdcToCents(row.lowest_bid),
      averageBidCents: usdcToCents(row.average_bid),
      
      // Time info
      firstBidTime: row.first_bid_time,
      lastBidTime: row.last_bid_time,
      isActive,
      hasEnded,
      timeLeftMs,
      
      // Top 3 bidders
      top3Bidders,
      
      // Cast content
      castData: castContent[row.cast_hash] || null,
      
      // Fee info
      protocolFeeBps: row.protocol_fee_bps,
      
      // Metadata
      createdAt: row.created_at,
      blockNumber: row.block_number,
      transactionHash: row.transaction_hash
    };
  });
  
  return c.json({ hotCasts });
});

// Analytics route - Get top bidders
app.get('/analytics/top-bidders', async (c) => {
  const limit = parseInt(c.req.query('limit') || '10');
  
  const result = await executeQuery(
    c.env,
    `WITH max_bids_per_auction AS (
      SELECT 
        bidder_fid,
        auction_id,
        MAX(amount) as max_bid_amount,
        COUNT(*) as bid_count_per_auction
      FROM bids
      GROUP BY bidder_fid, auction_id
    )
    SELECT 
      bidder_fid,
      COUNT(DISTINCT auction_id) as auctions_participated,
      SUM(bid_count_per_auction) as total_bids,
      SUM(max_bid_amount) as total_volume,
      MAX(max_bid_amount) as highest_bid
    FROM max_bids_per_auction
    GROUP BY bidder_fid
    ORDER BY total_bids DESC, total_volume DESC
    LIMIT $1`,
    [limit]
  );
  
  // Get all top creators for all top bidders in one query
  const topBidderFids = result.rows.map(row => row.bidder_fid);
  
  const topCreatorsResult = await executeQuery(
    c.env,
    `WITH bidder_creator_stats AS (
      SELECT 
        max_bid.bidder_fid,
        a.creator_fid,
        COUNT(DISTINCT a.id) as auctions_bid_on,
        SUM(max_bid.max_amount) as total_spent,
        MAX(max_bid.max_amount) as highest_bid
      FROM auctions a
      INNER JOIN (
        SELECT bidder_fid, auction_id, MAX(amount) as max_amount
        FROM bids
        WHERE bidder_fid = ANY($1)
        GROUP BY bidder_fid, auction_id
      ) max_bid ON a.id = max_bid.auction_id
      GROUP BY max_bid.bidder_fid, a.creator_fid
    ),
    ranked_creators AS (
      SELECT 
        *,
        ROW_NUMBER() OVER (PARTITION BY bidder_fid ORDER BY auctions_bid_on DESC, total_spent DESC) as rn
      FROM bidder_creator_stats
    )
    SELECT * FROM ranked_creators WHERE rn <= 5
    ORDER BY bidder_fid, rn`,
    [topBidderFids]
  );
  
  // Group creators by bidder
  const creatorsByBidder = {};
  const allCreatorFids = new Set();
  
  topCreatorsResult.rows.forEach(row => {
    if (!creatorsByBidder[row.bidder_fid]) {
      creatorsByBidder[row.bidder_fid] = [];
    }
    creatorsByBidder[row.bidder_fid].push(row);
    allCreatorFids.add(row.creator_fid);
  });
  
  // Get all user profiles (both bidders and creators) in one call
  const allFids = [...new Set([...topBidderFids, ...allCreatorFids])];
  const allProfiles = await c.get('neynarClient').getUsersByFids(allFids);
  
  // Build final response
  const topBidders = result.rows.map(row => {
    const topCreators = (creatorsByBidder[row.bidder_fid] || []).map(creator => ({
      creator_fid: creator.creator_fid,
      auctions_bid_on: parseInt(creator.auctions_bid_on) || 0,
      total_spent_cents: usdcToCents(creator.total_spent),
      highest_bid_cents: usdcToCents(creator.highest_bid),
      profile: allProfiles[creator.creator_fid] || null
    }));
    
    return {
      bidder_fid: row.bidder_fid,
      auctions_participated: parseInt(row.auctions_participated) || 0,
      total_bids: parseInt(row.total_bids) || 0,
      total_volume_cents: usdcToCents(row.total_volume),
      highest_bid_cents: usdcToCents(row.highest_bid),
      profile: allProfiles[row.bidder_fid] || null,
      top_creators: topCreators
    };
  });
  
  return c.json({ topBidders });
});

// Analytics route - Recent activity
app.get('/analytics/recent-activity', async (c) => {
  const limit = parseInt(c.req.query('limit') || '20');
  
  const result = await executeQuery(
    c.env,
    `SELECT 
      b.*,
      a.cast_hash
    FROM bids b
    JOIN auctions a ON b.auction_id = a.id
    ORDER BY b.timestamp DESC
    LIMIT $1`,
    [limit]
  );
  
  // Get unique FIDs for enrichment
  const fids = [...new Set(result.rows.map(row => row.bidder_fid))];
  const users = await c.get('neynarClient').getUsersByFids(fids);
  
  const activity = result.rows.map(row => ({
    id: row.id,
    auction_id: row.auction_id,
    bidder_address: row.bidder_address,
    bidder_fid: row.bidder_fid,
    amount_cents: usdcToCents(row.amount),
    timestamp: row.timestamp,
    transaction_hash: row.transaction_hash,
    block_number: row.block_number,
    cast_hash: row.cast_hash,
    bidderProfile: users[row.bidder_fid] || null
  }));
  
  return c.json({ activity });
});

// Analytics route - User bidding history
app.get('/analytics/user/:fid', async (c) => {
  const fid = parseInt(c.req.param('fid'));
  
  // Get user profile
  const userProfile = await c.get('neynarClient').getUser(fid);
  
  // Get user's bids
  const bidsResult = await executeQuery(
    c.env,
    `SELECT 
      b.*,
      a.cast_hash,
      a.creator_address,
      a.creator_fid,
      a.min_bid,
      a.end_time
    FROM bids b
    JOIN auctions a ON b.auction_id = a.id
    WHERE b.bidder_fid = $1
    ORDER BY b.timestamp DESC`,
    [fid]
  );
  
  // Get stats
  const statsResult = await executeQuery(
    c.env,
    `WITH max_bids_per_auction AS (
      SELECT 
        auction_id,
        MAX(amount) as max_bid_amount
      FROM bids
      WHERE bidder_fid = $1
      GROUP BY auction_id
    )
    SELECT 
      COUNT(DISTINCT b.auction_id) as auctions_participated,
      COUNT(*) as total_bids,
      (SELECT SUM(max_bid_amount) FROM max_bids_per_auction) as total_volume,
      MAX(b.amount) as highest_bid
    FROM bids b
    WHERE b.bidder_fid = $1`,
    [fid]
  );
  
  const stats = statsResult.rows[0];
  const bids = bidsResult.rows.map(bid => ({
    id: bid.id,
    auction_id: bid.auction_id,
    bidder_address: bid.bidder_address,
    bidder_fid: bid.bidder_fid,
    amount_cents: usdcToCents(bid.amount),
    timestamp: bid.timestamp,
    transaction_hash: bid.transaction_hash,
    block_number: bid.block_number,
    cast_hash: bid.cast_hash,
    creator_address: bid.creator_address,
    creator_fid: bid.creator_fid,
    min_bid_cents: usdcToCents(bid.min_bid),
    end_time: bid.end_time
  }));
  
  return c.json({
    profile: userProfile,
    stats: {
      auctions_participated: parseInt(stats.auctions_participated) || 0,
      total_bids: parseInt(stats.total_bids) || 0,
      total_volume_cents: usdcToCents(stats.total_volume),
      highest_bid_cents: usdcToCents(stats.highest_bid)
    },
    bids
  });
});

// Analytics route - Global stats
app.get('/analytics/stats', async (c) => {
  const result = await executeQuery(
    c.env,
    `WITH max_bids_per_auction AS (
      SELECT 
        bidder_fid,
        auction_id,
        MAX(amount) as max_bid_amount
      FROM bids
      GROUP BY bidder_fid, auction_id
    )
    SELECT 
      COUNT(DISTINCT bidder_fid) as total_simps,
      (SELECT COUNT(*) FROM bids) as total_bids,
      SUM(max_bid_amount) as total_volume,
      MAX(max_bid_amount) as highest_bid,
      (SELECT COUNT(*) FROM auctions WHERE state = 1) as active_auctions,
      (SELECT COUNT(*) FROM auctions WHERE state >= 2) as ended_auctions,
      (SELECT COUNT(*) FROM auctions) as total_auctions
    FROM max_bids_per_auction`
  );
  
  return c.json({
    totalSimps: parseInt(result.rows[0].total_simps) || 0,
    totalBids: parseInt(result.rows[0].total_bids) || 0,
    totalVolumeCents: usdcToCents(result.rows[0].total_volume),
    highestBidCents: usdcToCents(result.rows[0].highest_bid),
    activeAuctions: parseInt(result.rows[0].active_auctions) || 0,
    endedAuctions: parseInt(result.rows[0].ended_auctions) || 0,
    totalAuctions: parseInt(result.rows[0].total_auctions) || 0
  });
});

// Analytics route - Time-based top bidders
app.get('/analytics/top-bidders/timeframe', async (c) => {
  const period = c.req.query('period') || 'all-time';
  const limit = parseInt(c.req.query('limit') || '10');
  
  let timeClause = '';
  const now = new Date();
  
  switch(period) {
    case 'day':
      timeClause = `AND b.timestamp >= NOW() - INTERVAL '1 day'`;
      break;
    case 'week':
      timeClause = `AND b.timestamp >= NOW() - INTERVAL '7 days'`;
      break;
    case 'month':
      timeClause = `AND b.timestamp >= NOW() - INTERVAL '30 days'`;
      break;
    case 'all-time':
    default:
      timeClause = '';
  }
  
  const result = await executeQuery(
    c.env,
    `WITH max_bids_per_auction AS (
      SELECT 
        b.bidder_fid,
        b.auction_id,
        MAX(b.amount) as max_bid_amount,
        COUNT(*) as bid_count_per_auction
      FROM bids b
      WHERE 1=1 ${timeClause}
      GROUP BY b.bidder_fid, b.auction_id
    )
    SELECT 
      bidder_fid,
      COUNT(DISTINCT auction_id) as auctions_participated,
      SUM(bid_count_per_auction) as total_bids,
      SUM(max_bid_amount) as total_volume,
      MAX(max_bid_amount) as highest_bid
    FROM max_bids_per_auction
    GROUP BY bidder_fid
    ORDER BY total_bids DESC, total_volume DESC
    LIMIT $1`,
    [limit]
  );
  
  // Get all top creators for all top bidders in one query
  const topBidderFids = result.rows.map(row => row.bidder_fid);
  
  const topCreatorsResult = await executeQuery(
    c.env,
    `WITH bidder_creator_stats AS (
      SELECT 
        max_bid.bidder_fid,
        a.creator_fid,
        COUNT(DISTINCT a.id) as auctions_bid_on,
        SUM(max_bid.max_amount) as total_spent,
        MAX(max_bid.max_amount) as highest_bid
      FROM auctions a
      INNER JOIN (
        SELECT bidder_fid, auction_id, MAX(amount) as max_amount
        FROM bids b
        WHERE bidder_fid = ANY($1) ${timeClause}
        GROUP BY bidder_fid, auction_id
      ) max_bid ON a.id = max_bid.auction_id
      GROUP BY max_bid.bidder_fid, a.creator_fid
    ),
    ranked_creators AS (
      SELECT 
        *,
        ROW_NUMBER() OVER (PARTITION BY bidder_fid ORDER BY auctions_bid_on DESC, total_spent DESC) as rn
      FROM bidder_creator_stats
    )
    SELECT * FROM ranked_creators WHERE rn <= 5
    ORDER BY bidder_fid, rn`,
    [topBidderFids]
  );
  
  // Group creators by bidder
  const creatorsByBidder = {};
  const allCreatorFids = new Set();
  
  topCreatorsResult.rows.forEach(row => {
    if (!creatorsByBidder[row.bidder_fid]) {
      creatorsByBidder[row.bidder_fid] = [];
    }
    creatorsByBidder[row.bidder_fid].push(row);
    allCreatorFids.add(row.creator_fid);
  });
  
  // Get all user profiles (both bidders and creators) in one call
  const allFids = [...new Set([...topBidderFids, ...allCreatorFids])];
  const allProfiles = await c.get('neynarClient').getUsersByFids(allFids);
  
  // Build final response
  const topBidders = result.rows.map((row, index) => {
    const topCreators = (creatorsByBidder[row.bidder_fid] || []).map(creator => ({
      creator_fid: creator.creator_fid,
      auctions_bid_on: parseInt(creator.auctions_bid_on) || 0,
      total_spent_cents: usdcToCents(creator.total_spent),
      highest_bid_cents: usdcToCents(creator.highest_bid),
      profile: allProfiles[creator.creator_fid] || null
    }));
    
    return {
      bidder_fid: row.bidder_fid,
      auctions_participated: parseInt(row.auctions_participated) || 0,
      total_bids: parseInt(row.total_bids) || 0,
      total_volume_cents: usdcToCents(row.total_volume),
      highest_bid_cents: usdcToCents(row.highest_bid),
      rank: index + 1,
      period,
      profile: allProfiles[row.bidder_fid] || null,
      top_creators: topCreators
    };
  });
  
  return c.json({ topBidders, period });
});

// Analytics route - Simp battles (head-to-head comparison)
app.get('/analytics/simp-battles', async (c) => {
  // Check for username parameters
  const user1 = c.req.query('user1');
  const user2 = c.req.query('user2');
  
  // Check for FID parameters
  const fid1Param = c.req.query('fid1');
  const fid2Param = c.req.query('fid2');
  
  if ((!user1 && !fid1Param) || (!user2 && !fid2Param)) {
    return c.json({ error: 'Both users must be specified. Use either user1/user2 (for usernames) or fid1/fid2 (for FIDs)' }, 400);
  }
  
  // Resolve to FIDs
  let fid1, fid2;
  const neynarClient = c.get('neynarClient');
  
  // Handle user1/fid1
  if (user1) {
    // It's a username, look it up
    const userData = await neynarClient.getUserByUsername(user1);
    if (!userData) {
      return c.json({ error: `User not found: ${user1}` }, 404);
    }
    fid1 = userData.fid;
  } else {
    // It's an FID
    fid1 = parseInt(fid1Param);
    if (isNaN(fid1)) {
      return c.json({ error: 'fid1 must be a valid number' }, 400);
    }
  }
  
  // Handle user2/fid2
  if (user2) {
    // It's a username, look it up
    const userData = await neynarClient.getUserByUsername(user2);
    if (!userData) {
      return c.json({ error: `User not found: ${user2}` }, 404);
    }
    fid2 = userData.fid;
  } else {
    // It's an FID
    fid2 = parseInt(fid2Param);
    if (isNaN(fid2)) {
      return c.json({ error: 'fid2 must be a valid number' }, 400);
    }
  }
  
  // Get stats for both users
  const statsResult = await executeQuery(
    c.env,
    `WITH max_bids_per_auction AS (
      SELECT 
        bidder_fid,
        auction_id,
        MAX(amount) as max_bid_amount,
        COUNT(*) as bid_count_per_auction,
        MIN(timestamp) as first_bid_in_auction,
        MAX(timestamp) as last_bid_in_auction
      FROM bids
      WHERE bidder_fid IN ($1, $2)
      GROUP BY bidder_fid, auction_id
    )
    SELECT 
      bidder_fid,
      COUNT(DISTINCT auction_id) as auctions_participated,
      SUM(bid_count_per_auction) as total_bids,
      SUM(max_bid_amount) as total_volume,
      MAX(max_bid_amount) as highest_bid,
      MIN(first_bid_in_auction) as first_bid_date,
      MAX(last_bid_in_auction) as last_bid_date
    FROM max_bids_per_auction
    GROUP BY bidder_fid`,
    [fid1, fid2]
  );
  
  // Get user profiles first
  const users = await c.get('neynarClient').getUsersByFids([fid1, fid2]);
  
  // Find common auctions they both bid on
  const commonAuctionsResult = await executeQuery(
    c.env,
    `SELECT 
      a.cast_hash,
      a.creator_fid,
      MAX(CASE WHEN b.bidder_fid = $1 THEN b.amount END) as user1_highest_bid,
      MAX(CASE WHEN b.bidder_fid = $2 THEN b.amount END) as user2_highest_bid,
      COUNT(CASE WHEN b.bidder_fid = $1 THEN 1 END) as user1_bid_count,
      COUNT(CASE WHEN b.bidder_fid = $2 THEN 1 END) as user2_bid_count
    FROM bids b
    JOIN auctions a ON b.auction_id = a.id
    WHERE b.auction_id IN (
      SELECT auction_id FROM bids WHERE bidder_fid = $1
      INTERSECT
      SELECT auction_id FROM bids WHERE bidder_fid = $2
    )
    GROUP BY a.cast_hash, a.creator_fid`,
    [fid1, fid2]
  );
  
  // Format response
  const user1Stats = statsResult.rows.find(r => r.bidder_fid === fid1) || null;
  const user2Stats = statsResult.rows.find(r => r.bidder_fid === fid2) || null;
  
  const formatStats = (stats) => {
    if (!stats) return null;
    return {
      bidder_fid: stats.bidder_fid,
      auctions_participated: parseInt(stats.auctions_participated) || 0,
      total_bids: parseInt(stats.total_bids) || 0,
      total_volume_cents: usdcToCents(stats.total_volume),
      highest_bid_cents: usdcToCents(stats.highest_bid),
      first_bid_date: stats.first_bid_date,
      last_bid_date: stats.last_bid_date
    };
  };
  
  // Get creator profiles for common auctions
  const creatorFids = [...new Set(commonAuctionsResult.rows.map(row => row.creator_fid))];
  const creatorProfiles = creatorFids.length > 0 ? await c.get('neynarClient').getUsersByFids(creatorFids) : {};
  
  // Get cast content for common auctions
  const castHashes = commonAuctionsResult.rows.map(row => row.cast_hash);
  const castContent = castHashes.length > 0 ? await c.get('neynarClient').getCastsByHashes(castHashes) : {};
  
  const commonAuctions = commonAuctionsResult.rows.map(auction => ({
    cast_hash: auction.cast_hash,
    creator_fid: auction.creator_fid,
    creatorProfile: creatorProfiles[auction.creator_fid] || null,
    castData: castContent[auction.cast_hash] || null,
    user1_highest_bid_cents: usdcToCents(auction.user1_highest_bid),
    user2_highest_bid_cents: usdcToCents(auction.user2_highest_bid),
    user1_bid_count: parseInt(auction.user1_bid_count) || 0,
    user2_bid_count: parseInt(auction.user2_bid_count) || 0
  }));
  
  return c.json({
    user1: {
      fid: fid1,
      profile: users[fid1] || null,
      stats: formatStats(user1Stats)
    },
    user2: {
      fid: fid2,
      profile: users[fid2] || null,
      stats: formatStats(user2Stats)
    },
    commonAuctions: {
      total: commonAuctionsResult.rows.length,
      auctions: commonAuctions
    },
    winner: determineWinner(user1Stats, user2Stats)
  });
});

// Helper function to determine winner
function determineWinner(user1Stats, user2Stats) {
  if (!user1Stats || !user2Stats) return null;
  
  const scores = {
    user1: 0,
    user2: 0
  };
  
  // Compare different metrics
  if (parseInt(user1Stats.total_bids) > parseInt(user2Stats.total_bids)) scores.user1++;
  else scores.user2++;
  
  if (BigInt(user1Stats.total_volume || '0') > BigInt(user2Stats.total_volume || '0')) scores.user1++;
  else scores.user2++;
  
  if (BigInt(user1Stats.highest_bid || '0') > BigInt(user2Stats.highest_bid || '0')) scores.user1++;
  else scores.user2++;
  
  return {
    fid: scores.user1 > scores.user2 ? user1Stats.bidder_fid : user2Stats.bidder_fid,
    score: `${Math.max(scores.user1, scores.user2)}-${Math.min(scores.user1, scores.user2)}`
  };
}

// Analytics route - Trending data
app.get('/analytics/trending', async (c) => {
  // Hot auctions in last 24h
  const hotAuctionsResult = await executeQuery(
    c.env,
    `SELECT 
      a.cast_hash,
      a.creator_fid,
      a.end_time,
      COUNT(b.id) as recent_bid_count,
      MAX(b.amount) as highest_recent_bid,
      COUNT(DISTINCT b.bidder_fid) as unique_recent_bidders
    FROM auctions a
    JOIN bids b ON a.id = b.auction_id
    WHERE b.timestamp >= NOW() - INTERVAL '24 hours'
    GROUP BY a.id, a.cast_hash, a.creator_fid, a.end_time
    ORDER BY recent_bid_count DESC
    LIMIT 10`
  );
  
  // Rising simps - users with biggest increase in last 7 days
  const risingSimpsResult = await executeQuery(
    c.env,
    `WITH recent_stats AS (
      SELECT 
        bidder_fid,
        COUNT(*) as recent_bids,
        SUM(max_bid) as recent_volume
      FROM (
        SELECT bidder_fid, auction_id, MAX(amount) as max_bid
        FROM bids
        WHERE timestamp >= NOW() - INTERVAL '7 days'
        GROUP BY bidder_fid, auction_id
      ) recent_max_bids
      GROUP BY bidder_fid
    ),
    previous_stats AS (
      SELECT 
        bidder_fid,
        COUNT(*) as previous_bids,
        SUM(max_bid) as previous_volume
      FROM (
        SELECT bidder_fid, auction_id, MAX(amount) as max_bid
        FROM bids
        WHERE timestamp >= NOW() - INTERVAL '14 days' 
          AND timestamp < NOW() - INTERVAL '7 days'
        GROUP BY bidder_fid, auction_id
      ) previous_max_bids
      GROUP BY bidder_fid
    )
    SELECT 
      r.bidder_fid,
      r.recent_bids,
      r.recent_volume,
      COALESCE(p.previous_bids, 0) as previous_bids,
      COALESCE(p.previous_volume, 0) as previous_volume,
      r.recent_bids - COALESCE(p.previous_bids, 0) as bid_increase,
      CASE 
        WHEN COALESCE(p.previous_bids, 0) = 0 THEN 999
        ELSE ((r.recent_bids::float / NULLIF(p.previous_bids, 0)) - 1) * 100
      END as growth_percentage
    FROM recent_stats r
    LEFT JOIN previous_stats p ON r.bidder_fid = p.bidder_fid
    WHERE r.recent_bids > 5
    ORDER BY growth_percentage DESC
    LIMIT 10`
  );
  
  // Get user profiles for rising simps
  const fids = risingSimpsResult.rows.map(row => row.bidder_fid);
  const users = await c.get('neynarClient').getUsersByFids(fids);
  
  const risingSimps = risingSimpsResult.rows.map(row => ({
    ...row,
    profile: users[row.bidder_fid] || null
  }));
  
  // Get cast content for hot auctions
  const castHashes = hotAuctionsResult.rows.map(row => row.cast_hash);
  const castContent = castHashes.length > 0 ? await c.get('neynarClient').getCastsByHashes(castHashes) : {};
  
  // Get creator profiles for hot auctions
  const creatorFids = [...new Set(hotAuctionsResult.rows.map(row => row.creator_fid))];
  const creatorProfiles = creatorFids.length > 0 ? await c.get('neynarClient').getUsersByFids(creatorFids) : {};
  
  const hotAuctions = hotAuctionsResult.rows.map(auction => ({
    cast_hash: auction.cast_hash,
    creator_fid: auction.creator_fid,
    creatorProfile: creatorProfiles[auction.creator_fid] || null,
    castData: castContent[auction.cast_hash] || null,
    end_time: auction.end_time,
    recent_bid_count: parseInt(auction.recent_bid_count) || 0,
    highest_recent_bid_cents: usdcToCents(auction.highest_recent_bid),
    unique_recent_bidders: parseInt(auction.unique_recent_bidders) || 0
  }));
  
  const formattedRisingSimps = risingSimps.map(simp => ({
    bidder_fid: simp.bidder_fid,
    recent_bids: parseInt(simp.recent_bids) || 0,
    recent_volume_cents: usdcToCents(simp.recent_volume),
    previous_bids: parseInt(simp.previous_bids) || 0,
    previous_volume_cents: usdcToCents(simp.previous_volume),
    bid_increase: parseInt(simp.bid_increase) || 0,
    growth_percentage: parseFloat(simp.growth_percentage) || 0,
    profile: simp.profile
  }));
  
  return c.json({
    hotAuctions,
    risingSimps: formattedRisingSimps
  });
});

// Analytics route - Simp level calculator
app.get('/analytics/simp-level/:fid', async (c) => {
  const fid = parseInt(c.req.param('fid'));
  
  // Get user stats
  const statsResult = await executeQuery(
    c.env,
    `WITH max_bids_per_auction AS (
      SELECT 
        auction_id,
        MAX(amount) as max_bid_amount,
        MIN(timestamp) as first_bid_in_auction,
        MAX(timestamp) as last_bid_in_auction
      FROM bids
      WHERE bidder_fid = $1
      GROUP BY auction_id
    )
    SELECT 
      COUNT(DISTINCT b.auction_id) as auctions_participated,
      COUNT(*) as total_bids,
      (SELECT SUM(max_bid_amount) FROM max_bids_per_auction) as total_volume,
      MAX(b.amount) as highest_bid,
      (SELECT MIN(first_bid_in_auction) FROM max_bids_per_auction) as first_bid_date,
      (SELECT MAX(last_bid_in_auction) FROM max_bids_per_auction) as last_bid_date
    FROM bids b
    WHERE b.bidder_fid = $1`,
    [fid]
  );
  
  // Get user's rank
  const rankResult = await executeQuery(
    c.env,
    `WITH max_bids_per_user_auction AS (
      SELECT 
        bidder_fid,
        auction_id,
        MAX(amount) as max_bid_amount,
        COUNT(*) as bid_count_per_auction
      FROM bids
      GROUP BY bidder_fid, auction_id
    ),
    user_ranks AS (
      SELECT 
        bidder_fid,
        SUM(bid_count_per_auction) as total_bids,
        RANK() OVER (ORDER BY SUM(bid_count_per_auction) DESC) as bid_rank,
        RANK() OVER (ORDER BY SUM(max_bid_amount) DESC) as volume_rank
      FROM max_bids_per_user_auction
      GROUP BY bidder_fid
    )
    SELECT * FROM user_ranks WHERE bidder_fid = $1`,
    [fid]
  );
  
  // Get total number of simps for percentile
  const totalSimpsResult = await executeQuery(
    c.env,
    'SELECT COUNT(DISTINCT bidder_fid) as total FROM bids'
  );
  
  const stats = statsResult.rows[0];
  const rank = rankResult.rows[0];
  const totalSimps = parseInt(totalSimpsResult.rows[0].total);
  
  if (!stats || parseInt(stats.total_bids) === 0) {
    return c.json({
      fid,
      level: 'Not a simp yet',
      emoji: '🤔',
      stats: null,
      rank: null,
      percentile: null,
      achievements: [],
      nextMilestone: {
        name: 'Place your first bid',
        requirement: 1,
        current: 0,
        type: 'bids'
      }
    });
  }
  
  // Calculate simp level
  const totalBids = parseInt(stats.total_bids);
  const simpLevel = getSimpLevel(totalBids);
  
  // Calculate percentile
  const percentile = rank ? ((totalSimps - parseInt(rank.bid_rank) + 1) / totalSimps * 100).toFixed(1) : 0;
  
  // Get user profile
  const userProfile = await c.get('neynarClient').getUser(fid);
  
  // Calculate achievements
  const achievements = getAchievements(stats);
  
  // Calculate next milestone
  const nextMilestone = getNextMilestone(stats);
  
  return c.json({
    fid,
    profile: userProfile,
    level: simpLevel.level,
    emoji: simpLevel.emoji,
    stats: {
      auctions_participated: parseInt(stats.auctions_participated) || 0,
      total_bids: parseInt(stats.total_bids) || 0,
      total_volume_cents: usdcToCents(stats.total_volume),
      highest_bid_cents: usdcToCents(stats.highest_bid),
      first_bid_date: stats.first_bid_date,
      last_bid_date: stats.last_bid_date
    },
    rank: {
      bidRank: rank ? parseInt(rank.bid_rank) : null,
      volumeRank: rank ? parseInt(rank.volume_rank) : null,
      totalSimps
    },
    percentile: `Top ${percentile}%`,
    achievements,
    nextMilestone
  });
});

// Helper function for simp levels
function getSimpLevel(totalBids) {
  if (totalBids >= 1000) return { level: 'Omega Simp', emoji: '🌟' };
  if (totalBids >= 500) return { level: 'Ultra Simp', emoji: '💎' };
  if (totalBids >= 100) return { level: 'Giga Simp', emoji: '👑' };
  if (totalBids >= 50) return { level: 'Mega Simp', emoji: '🔥' };
  if (totalBids >= 20) return { level: 'Super Simp', emoji: '💪' };
  if (totalBids >= 10) return { level: 'Simp Pro', emoji: '⭐' };
  if (totalBids >= 5) return { level: 'Simp', emoji: '💖' };
  return { level: 'Simp Rookie', emoji: '🌱' };
}

// Helper function for achievements
function getAchievements(stats) {
  const achievements = [];
  const totalBids = parseInt(stats.total_bids);
  const totalVolume = BigInt(stats.total_volume || '0');
  const highestBid = BigInt(stats.highest_bid || '0');
  
  if (totalBids >= 1) achievements.push({ name: 'First Steps', emoji: '👣', description: 'Placed first bid' });
  if (totalBids >= 10) achievements.push({ name: 'Getting Serious', emoji: '💯', description: '10 bids placed' });
  if (totalBids >= 50) achievements.push({ name: 'Dedicated Simp', emoji: '🎯', description: '50 bids placed' });
  if (totalBids >= 100) achievements.push({ name: 'Century Club', emoji: '💯', description: '100 bids placed' });
  if (totalVolume >= 100000000n) achievements.push({ name: 'Big Spender', emoji: '💰', description: '$100+ spent' });
  if (totalVolume >= 1000000000n) achievements.push({ name: 'Whale', emoji: '🐋', description: '$1000+ spent' });
  if (highestBid >= 50000000n) achievements.push({ name: 'High Roller', emoji: '🎰', description: '$50+ single bid' });
  
  return achievements;
}

// Helper function for next milestone
function getNextMilestone(stats) {
  const totalBids = parseInt(stats.total_bids);
  const totalVolume = BigInt(stats.total_volume || '0');
  
  const bidMilestones = [1, 5, 10, 20, 50, 100, 500, 1000];
  const nextBidMilestone = bidMilestones.find(m => m > totalBids);
  
  if (nextBidMilestone) {
    return {
      name: `Reach ${nextBidMilestone} total bids`,
      requirement: nextBidMilestone,
      current: totalBids,
      type: 'bids'
    };
  }
  
  const volumeInUSD = Number(totalVolume) / 1_000_000;
  const volumeMilestones = [10, 50, 100, 500, 1000, 5000, 10000];
  const nextVolumeMilestone = volumeMilestones.find(m => m > volumeInUSD);
  
  if (nextVolumeMilestone) {
    return {
      name: `Spend $${nextVolumeMilestone} total`,
      requirement: nextVolumeMilestone,
      current: volumeInUSD,
      type: 'volume'
    };
  }
  
  return {
    name: 'Legendary Status',
    requirement: '∞',
    current: totalBids,
    type: 'legendary'
  };
}

// Analytics route - Hot users (creators with most money gained)
app.get('/analytics/hot-users', async (c) => {
  const limit = parseInt(c.req.query('limit') || '20');
  
  const result = await executeQuery(
    c.env,
    `WITH auction_revenues AS (
      SELECT 
        a.creator_fid,
        a.id as auction_id,
        a.state,
        CASE 
          WHEN a.state >= 3 THEN MAX(b.amount)
          WHEN a.state < 3 THEN MAX(b.amount)
          ELSE 0
        END as revenue,
        COUNT(DISTINCT b.bidder_fid) as unique_bidders,
        COUNT(b.id) as total_bids
      FROM auctions a
      LEFT JOIN bids b ON a.id = b.auction_id
      GROUP BY a.id, a.creator_fid, a.state
    ),
    creator_totals AS (
      SELECT 
        creator_fid,
        COUNT(DISTINCT auction_id) as total_auctions,
        COUNT(DISTINCT CASE WHEN state >= 3 THEN auction_id END) as settled_auctions,
        SUM(revenue) as total_revenue,
        SUM(unique_bidders) as total_unique_bidders,
        SUM(total_bids) as total_bids_received,
        MAX(revenue) as highest_auction_revenue,
        AVG(CASE WHEN revenue > 0 THEN revenue END) as avg_auction_revenue
      FROM auction_revenues
      GROUP BY creator_fid
      HAVING SUM(revenue) > 0
    )
    SELECT 
      ct.*,
      COUNT(DISTINCT b.bidder_fid) as unique_simps
    FROM creator_totals ct
    LEFT JOIN auctions a ON ct.creator_fid = a.creator_fid
    LEFT JOIN bids b ON a.id = b.auction_id
    GROUP BY ct.creator_fid, ct.total_auctions, ct.settled_auctions, 
             ct.total_revenue, ct.total_unique_bidders, ct.total_bids_received,
             ct.highest_auction_revenue, ct.avg_auction_revenue
    ORDER BY ct.total_revenue DESC
    LIMIT $1`,
    [limit]
  );
  
  // Get recent auctions for each creator
  const creatorFids = result.rows.map(row => row.creator_fid);
  
  const recentAuctionsResult = await executeQuery(
    c.env,
    `WITH recent_auctions AS (
      SELECT 
        a.creator_fid,
        a.cast_hash,
        a.end_time,
        a.state,
        CASE 
          WHEN a.state >= 3 THEN MAX(b.amount)
          WHEN a.state < 3 THEN MAX(b.amount)
          ELSE 0
        END as revenue,
        COUNT(b.id) as bid_count,
        ROW_NUMBER() OVER (PARTITION BY a.creator_fid ORDER BY a.created_at DESC) as rn
      FROM auctions a
      LEFT JOIN bids b ON a.id = b.auction_id
      WHERE a.creator_fid = ANY($1)
      GROUP BY a.id, a.cast_hash, a.end_time, a.state, a.creator_fid, a.created_at
    )
    SELECT * FROM recent_auctions WHERE rn <= 3`,
    [creatorFids]
  );
  
  // Group recent auctions by creator
  const recentAuctionsByCreator = {};
  recentAuctionsResult.rows.forEach(row => {
    if (!recentAuctionsByCreator[row.creator_fid]) {
      recentAuctionsByCreator[row.creator_fid] = [];
    }
    recentAuctionsByCreator[row.creator_fid].push({
      cast_hash: row.cast_hash,
      end_time: row.end_time,
      state: row.state,
      revenue_cents: usdcToCents(row.revenue),
      bid_count: parseInt(row.bid_count) || 0
    });
  });
  
  // Get creator profiles
  const creatorProfiles = await c.get('neynarClient').getUsersByFids(creatorFids);
  
  // Get cast data for recent auctions
  const allCastHashes = recentAuctionsResult.rows.map(row => row.cast_hash);
  const castContent = allCastHashes.length > 0 ? await c.get('neynarClient').getCastsByHashes(allCastHashes) : {};
  
  // Format the response
  const hotUsers = result.rows.map(row => ({
    creator_fid: row.creator_fid,
    profile: creatorProfiles[row.creator_fid] || null,
    stats: {
      total_revenue_cents: usdcToCents(row.total_revenue),
      total_auctions: parseInt(row.total_auctions) || 0,
      settled_auctions: parseInt(row.settled_auctions) || 0,
      unique_simps: parseInt(row.unique_simps) || 0,
      total_bids_received: parseInt(row.total_bids_received) || 0,
      highest_auction_revenue_cents: usdcToCents(row.highest_auction_revenue),
      avg_auction_revenue_cents: usdcToCents(row.avg_auction_revenue)
    },
    recent_auctions: (recentAuctionsByCreator[row.creator_fid] || []).map(auction => ({
      ...auction,
      castData: castContent[auction.cast_hash] || null
    }))
  }));
  
  return c.json({ hotUsers });
});

// Analytics route - Creator stats
app.get('/analytics/creator-stats/:fid', async (c) => {
  const fid = parseInt(c.req.param('fid'));
  
  // Get creator's auction stats
  const auctionStatsResult = await executeQuery(
    c.env,
    `SELECT 
      COUNT(*) as total_auctions,
      COUNT(DISTINCT CASE WHEN state = 1 THEN id END) as active_auctions,
      COUNT(DISTINCT CASE WHEN state >= 2 THEN id END) as ended_auctions,
      SUM(CASE WHEN state >= 3 THEN 
        CAST(protocol_fee_bps AS NUMERIC) * 
        (SELECT MAX(amount) FROM bids WHERE auction_id = auctions.id) / 10000
      ELSE 0 END) as total_fees_earned
    FROM auctions
    WHERE creator_fid = $1`,
    [fid]
  );
  
  // Get bidding activity on creator's auctions
  const biddingStatsResult = await executeQuery(
    c.env,
    `WITH max_bids_per_bidder_auction AS (
      SELECT 
        a.id as auction_id,
        b.bidder_fid,
        MAX(b.amount) as max_bid_amount,
        COUNT(b.id) as bid_count
      FROM auctions a
      JOIN bids b ON a.id = b.auction_id
      WHERE a.creator_fid = $1
      GROUP BY a.id, b.bidder_fid
    )
    SELECT 
      COUNT(DISTINCT bidder_fid) as unique_simps,
      SUM(bid_count) as total_bids_received,
      SUM(max_bid_amount) as total_volume,
      MAX(max_bid_amount) as highest_bid_received,
      AVG(max_bid_amount) as average_bid
    FROM max_bids_per_bidder_auction`,
    [fid]
  );
  
  // Get top simps for this creator
  const topSimpsResult = await executeQuery(
    c.env,
    `WITH max_bids_per_auction AS (
      SELECT 
        b.bidder_fid,
        a.id as auction_id,
        MAX(b.amount) as max_bid_amount,
        COUNT(*) as bid_count_per_auction
      FROM auctions a
      JOIN bids b ON a.id = b.auction_id
      WHERE a.creator_fid = $1
      GROUP BY b.bidder_fid, a.id
    )
    SELECT 
      bidder_fid,
      SUM(bid_count_per_auction) as bid_count,
      SUM(max_bid_amount) as total_spent,
      MAX(max_bid_amount) as highest_bid
    FROM max_bids_per_auction
    GROUP BY bidder_fid
    ORDER BY total_spent DESC
    LIMIT 10`,
    [fid]
  );
  
  // Get creator profile
  const creatorProfile = await c.get('neynarClient').getUser(fid);
  
  // Get simp profiles
  const simpFids = topSimpsResult.rows.map(row => row.bidder_fid);
  const simpProfiles = await c.get('neynarClient').getUsersByFids(simpFids);
  
  const topSimps = topSimpsResult.rows.map(row => ({
    ...row,
    profile: simpProfiles[row.bidder_fid] || null
  }));
  
  // Get recent auctions
  const recentAuctionsResult = await executeQuery(
    c.env,
    `SELECT 
      a.cast_hash,
      a.end_time,
      a.state,
      COUNT(b.id) as bid_count,
      MAX(b.amount) as highest_bid
    FROM auctions a
    LEFT JOIN bids b ON a.id = b.auction_id
    WHERE a.creator_fid = $1
    GROUP BY a.id, a.cast_hash, a.end_time, a.state
    ORDER BY a.created_at DESC
    LIMIT 5`,
    [fid]
  );
  
  const auctionStats = auctionStatsResult.rows[0];
  const biddingStats = biddingStatsResult.rows[0];
  
  const formatAuctionStats = {
    total_auctions: parseInt(auctionStats.total_auctions) || 0,
    active_auctions: parseInt(auctionStats.active_auctions) || 0,
    ended_auctions: parseInt(auctionStats.ended_auctions) || 0,
    total_fees_earned_cents: usdcToCents(auctionStats.total_fees_earned)
  };
  
  const formatBiddingStats = {
    unique_simps: parseInt(biddingStats.unique_simps) || 0,
    total_bids_received: parseInt(biddingStats.total_bids_received) || 0,
    total_volume_cents: usdcToCents(biddingStats.total_volume),
    highest_bid_received_cents: usdcToCents(biddingStats.highest_bid_received),
    average_bid_cents: usdcToCents(biddingStats.average_bid)
  };
  
  const formattedTopSimps = topSimps.map(simp => ({
    bidder_fid: simp.bidder_fid,
    bid_count: parseInt(simp.bid_count) || 0,
    total_spent_cents: usdcToCents(simp.total_spent),
    highest_bid_cents: usdcToCents(simp.highest_bid),
    profile: simp.profile
  }));
  
  // Get cast content for recent auctions
  const recentCastHashes = recentAuctionsResult.rows.map(row => row.cast_hash);
  const recentCastContent = recentCastHashes.length > 0 ? await c.get('neynarClient').getCastsByHashes(recentCastHashes) : {};
  
  const formattedRecentAuctions = recentAuctionsResult.rows.map(auction => ({
    cast_hash: auction.cast_hash,
    end_time: auction.end_time,
    state: auction.state,
    bid_count: parseInt(auction.bid_count) || 0,
    highest_bid_cents: usdcToCents(auction.highest_bid),
    castData: recentCastContent[auction.cast_hash] || null
  }));
  
  return c.json({
    creator: {
      fid,
      profile: creatorProfile
    },
    auctionStats: formatAuctionStats,
    biddingStats: formatBiddingStats,
    topSimps: formattedTopSimps,
    recentAuctions: formattedRecentAuctions
  });
});

// Analytics route - Outbid history (rivalry tracker)
app.get('/analytics/outbid-history/:fid', async (c) => {
  const fid = parseInt(c.req.param('fid'));
  
  // Find who this user has outbid most often
  const outbidByUserResult = await executeQuery(
    c.env,
    `WITH bid_sequences AS (
      SELECT 
        b1.auction_id,
        b1.bidder_fid as outbidder,
        b2.bidder_fid as outbid_victim,
        b1.amount as winning_amount,
        b2.amount as losing_amount
      FROM bids b1
      JOIN bids b2 ON b1.auction_id = b2.auction_id 
        AND b1.timestamp > b2.timestamp
        AND b1.amount > b2.amount
      WHERE b1.bidder_fid = $1
        AND NOT EXISTS (
          SELECT 1 FROM bids b3 
          WHERE b3.auction_id = b1.auction_id 
            AND b3.timestamp > b2.timestamp 
            AND b3.timestamp < b1.timestamp
        )
    )
    SELECT 
      outbid_victim as victim_fid,
      COUNT(*) as times_outbid,
      SUM(winning_amount - losing_amount) as total_outbid_amount,
      MAX(winning_amount - losing_amount) as max_outbid_amount
    FROM bid_sequences
    GROUP BY outbid_victim
    ORDER BY times_outbid DESC
    LIMIT 10`,
    [fid]
  );
  
  // Find who has outbid this user most often
  const outbidThisUserResult = await executeQuery(
    c.env,
    `WITH bid_sequences AS (
      SELECT 
        b1.auction_id,
        b1.bidder_fid as outbidder,
        b2.bidder_fid as outbid_victim,
        b1.amount as winning_amount,
        b2.amount as losing_amount
      FROM bids b1
      JOIN bids b2 ON b1.auction_id = b2.auction_id 
        AND b1.timestamp > b2.timestamp
        AND b1.amount > b2.amount
      WHERE b2.bidder_fid = $1
        AND NOT EXISTS (
          SELECT 1 FROM bids b3 
          WHERE b3.auction_id = b1.auction_id 
            AND b3.timestamp > b2.timestamp 
            AND b3.timestamp < b1.timestamp
        )
    )
    SELECT 
      outbidder as rival_fid,
      COUNT(*) as times_been_outbid,
      SUM(winning_amount - losing_amount) as total_outbid_amount,
      MAX(winning_amount - losing_amount) as max_outbid_amount
    FROM bid_sequences
    GROUP BY outbidder
    ORDER BY times_been_outbid DESC
    LIMIT 10`,
    [fid]
  );
  
  // Get user profile
  const userProfile = await c.get('neynarClient').getUser(fid);
  
  // Get profiles for victims and rivals
  const victimFids = outbidByUserResult.rows.map(row => row.victim_fid);
  const rivalFids = outbidThisUserResult.rows.map(row => row.rival_fid);
  const allFids = [...new Set([...victimFids, ...rivalFids])];
  const profiles = await c.get('neynarClient').getUsersByFids(allFids);
  
  // Format results
  const victimsWithProfiles = outbidByUserResult.rows.map(row => ({
    victim_fid: row.victim_fid,
    times_outbid: parseInt(row.times_outbid) || 0,
    total_outbid_amount_cents: usdcToCents(row.total_outbid_amount),
    max_outbid_amount_cents: usdcToCents(row.max_outbid_amount),
    profile: profiles[row.victim_fid] || null
  }));
  
  const rivalsWithProfiles = outbidThisUserResult.rows.map(row => ({
    rival_fid: row.rival_fid,
    times_been_outbid: parseInt(row.times_been_outbid) || 0,
    total_outbid_amount_cents: usdcToCents(row.total_outbid_amount),
    max_outbid_amount_cents: usdcToCents(row.max_outbid_amount),
    profile: profiles[row.rival_fid] || null
  }));
  
  // Find biggest rival (most bidding interactions)
  const rivalryScores = {};
  
  outbidByUserResult.rows.forEach(row => {
    rivalryScores[row.victim_fid] = (rivalryScores[row.victim_fid] || 0) + parseInt(row.times_outbid);
  });
  
  outbidThisUserResult.rows.forEach(row => {
    rivalryScores[row.rival_fid] = (rivalryScores[row.rival_fid] || 0) + parseInt(row.times_been_outbid);
  });
  
  const biggestRivalFid = Object.entries(rivalryScores)
    .sort(([, a], [, b]) => b - a)[0]?.[0];
  
  return c.json({
    user: {
      fid,
      profile: userProfile
    },
    outbidByUser: {
      total: victimsWithProfiles.length,
      victims: victimsWithProfiles
    },
    outbidThisUser: {
      total: rivalsWithProfiles.length,
      rivals: rivalsWithProfiles
    },
    biggestRival: biggestRivalFid ? {
      fid: parseInt(biggestRivalFid),
      profile: profiles[biggestRivalFid] || null,
      totalInteractions: rivalryScores[biggestRivalFid]
    } : null
  });
});

// Protected route - Manual sync
app.post('/sync', quickAuthMiddleware, async (c) => {
  try {
    const result = await syncEvents(c.env);
    return c.json({
      success: true,
      eventsProcessed: result.eventsProcessed,
      lastBlock: result.lastBlock
    });
  } catch (error) {
    console.error('Sync error:', error);
    return c.json({ error: 'Sync failed', details: error.message }, 500);
  }
});

// Analytics route - Hall of Shame user profile (consolidated data for popup)
app.get('/analytics/hall-of-shame/:fid', async (c) => {
  const fid = parseInt(c.req.param('fid'));
  
  // Get user profile
  const userProfile = await c.get('neynarClient').getUser(fid);
  
  if (!userProfile) {
    return c.json({ error: 'User not found' }, 404);
  }
  
  // Get user's overall stats
  const statsResult = await executeQuery(
    c.env,
    `WITH user_max_bids AS (
      SELECT 
        auction_id,
        MAX(amount) as max_amount
      FROM bids
      WHERE bidder_fid = $1
      GROUP BY auction_id
    )
    SELECT 
      COUNT(DISTINCT b.auction_id) as auctions_participated,
      COUNT(*) as total_bids,
      (SELECT SUM(max_amount) FROM user_max_bids) as total_volume,
      MAX(b.amount) as highest_bid,
      MIN(b.timestamp) as first_bid_date,
      MAX(b.timestamp) as last_bid_date
    FROM bids b
    WHERE b.bidder_fid = $1`,
    [fid]
  );
  
  // Get user's rank
  const rankResult = await executeQuery(
    c.env,
    `WITH max_bids_per_user_auction AS (
      SELECT 
        bidder_fid,
        auction_id,
        MAX(amount) as max_bid_amount,
        COUNT(*) as bid_count_per_auction
      FROM bids
      GROUP BY bidder_fid, auction_id
    ),
    user_ranks AS (
      SELECT 
        bidder_fid,
        SUM(bid_count_per_auction) as total_bids,
        RANK() OVER (ORDER BY SUM(bid_count_per_auction) DESC) as bid_rank,
        RANK() OVER (ORDER BY SUM(max_bid_amount) DESC) as volume_rank
      FROM max_bids_per_user_auction
      GROUP BY bidder_fid
    )
    SELECT * FROM user_ranks WHERE bidder_fid = $1`,
    [fid]
  );
  
  // Get top 5 creators they simp for
  const topCreatorsResult = await executeQuery(
    c.env,
    `WITH user_bids_per_auction AS (
      SELECT 
        b.auction_id,
        a.creator_fid,
        MAX(b.amount) as max_amount,
        COUNT(b.id) as bid_count
      FROM bids b
      INNER JOIN auctions a ON b.auction_id = a.id
      WHERE b.bidder_fid = $1
      GROUP BY b.auction_id, a.creator_fid
    )
    SELECT 
      creator_fid,
      COUNT(DISTINCT auction_id) as auctions_bid_on,
      SUM(max_amount) as total_spent,
      MAX(max_amount) as highest_bid,
      SUM(bid_count) as total_bids_placed
    FROM user_bids_per_auction
    GROUP BY creator_fid
    ORDER BY auctions_bid_on DESC, total_spent DESC
    LIMIT 5`,
    [fid]
  );
  
  // Get casts they've bid on most times
  const mostBidCastsResult = await executeQuery(
    c.env,
    `SELECT 
      a.id as auction_id,
      a.cast_hash,
      a.creator_fid,
      a.end_time,
      a.state,
      COUNT(b.id) as user_bid_count,
      MAX(b.amount) as user_highest_bid,
      MIN(b.timestamp) as first_bid_time,
      MAX(b.timestamp) as last_bid_time,
      (SELECT MAX(amount) FROM bids WHERE auction_id = a.id) as auction_highest_bid,
      (SELECT COUNT(*) FROM bids WHERE auction_id = a.id) as total_auction_bids
    FROM auctions a
    INNER JOIN bids b ON a.id = b.auction_id AND b.bidder_fid = $1
    GROUP BY a.id, a.cast_hash, a.creator_fid, a.end_time, a.state
    ORDER BY user_bid_count DESC, user_highest_bid DESC
    LIMIT 5`,
    [fid]
  );
  
  // Get creator profiles and cast data
  const creatorFids = [...new Set([
    ...topCreatorsResult.rows.map(r => r.creator_fid),
    ...mostBidCastsResult.rows.map(r => r.creator_fid)
  ])];
  const castHashes = mostBidCastsResult.rows.map(r => r.cast_hash);
  
  const [creatorProfiles, castData] = await Promise.all([
    creatorFids.length > 0 ? c.get('neynarClient').getUsersByFids(creatorFids) : {},
    castHashes.length > 0 ? c.get('neynarClient').getCastsByHashes(castHashes) : {}
  ]);
  
  // Calculate simp level
  const stats = statsResult.rows[0];
  const totalBids = parseInt(stats.total_bids) || 0;
  let level, emoji;
  
  if (totalBids === 0) {
    level = 'Not a simp yet';
    emoji = '🤔';
  } else if (totalBids <= 4) {
    level = 'Simp Rookie';
    emoji = '🌱';
  } else if (totalBids <= 9) {
    level = 'Simp';
    emoji = '💖';
  } else if (totalBids <= 19) {
    level = 'Simp Pro';
    emoji = '⭐';
  } else if (totalBids <= 49) {
    level = 'Super Simp';
    emoji = '💪';
  } else if (totalBids <= 99) {
    level = 'Mega Simp';
    emoji = '🔥';
  } else if (totalBids <= 499) {
    level = 'Giga Simp';
    emoji = '👑';
  } else if (totalBids <= 999) {
    level = 'Ultra Simp';
    emoji = '💎';
  } else {
    level = 'Omega Simp';
    emoji = '🌟';
  }
  
  // Format response
  const rank = rankResult.rows[0];
  
  return c.json({
    user: {
      fid,
      profile: userProfile,
      simpLevel: {
        level,
        emoji,
        totalBids
      }
    },
    stats: {
      auctionsParticipated: parseInt(stats.auctions_participated) || 0,
      totalBids: parseInt(stats.total_bids) || 0,
      totalVolumeCents: usdcToCents(stats.total_volume),
      highestBidCents: usdcToCents(stats.highest_bid),
      firstBidDate: stats.first_bid_date,
      lastBidDate: stats.last_bid_date,
      bidRank: rank ? parseInt(rank.bid_rank) : null,
      volumeRank: rank ? parseInt(rank.volume_rank) : null
    },
    topCreators: topCreatorsResult.rows.map(row => ({
      creatorFid: row.creator_fid,
      auctionsBidOn: parseInt(row.auctions_bid_on) || 0,
      totalSpentCents: usdcToCents(row.total_spent),
      highestBidCents: usdcToCents(row.highest_bid),
      totalBidsPlaced: parseInt(row.total_bids_placed) || 0,
      profile: creatorProfiles[row.creator_fid] || null
    })),
    mostBidCasts: mostBidCastsResult.rows.map(row => ({
      auctionId: row.auction_id,
      castHash: row.cast_hash,
      creatorFid: row.creator_fid,
      endTime: row.end_time,
      state: row.state,
      userBidCount: parseInt(row.user_bid_count) || 0,
      userHighestBidCents: usdcToCents(row.user_highest_bid),
      firstBidTime: row.first_bid_time,
      lastBidTime: row.last_bid_time,
      auctionHighestBidCents: usdcToCents(row.auction_highest_bid),
      totalAuctionBids: parseInt(row.total_auction_bids) || 0,
      creatorProfile: creatorProfiles[row.creator_fid] || null,
      castData: castData[row.cast_hash] || null
    }))
  });
});

// Export for Cloudflare Workers
export default {
  async fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },
  
  // Scheduled handler for automatic syncing
  async scheduled(event, env, ctx) {
    console.log('Running scheduled sync...');
    try {
      const result = await syncEvents(env);
      console.log(`Sync completed. Processed ${result.eventsProcessed} events up to block ${result.lastBlock}`);
    } catch (error) {
      console.error('Scheduled sync failed:', error);
    }
  }
};
