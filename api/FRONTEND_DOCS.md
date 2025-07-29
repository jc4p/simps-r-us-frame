# Simps R Us - Frontend API Documentation

Welcome to the Simps R Us API! This document explains how to integrate with the NFT bidding tracker API to build your simp leaderboards and rankings.

## Base URL

```
Development: http://localhost:8787
Production: https://your-api.workers.dev
```

## Overview

Simps R Us tracks users who bid on Farcaster collectible casts. The more someone bids, the bigger simp they are! This API provides all the data you need to create leaderboards, user profiles, and auction tracking.

### Important: Volume Calculation

All volume metrics represent the **maximum bid per auction per user**, not the sum of all bids:
- If a user bids $10, $20, then $30 on the same auction, their volume is $30 (not $60)
- This shows how much they're actually willing to spend, not bid escalation
- All amounts are returned in cents for easy calculation

### Cast Data

All endpoints that return auction/cast information now include a `castData` field with:
- `hash`: The cast hash
- `text`: The cast text content
- `timestamp`: When the cast was created
- `firstEmbed`: The first embed (if any), which can be:
  - **Image/URL embed**: `{ type: 'image' | 'url', url: string, metadata: {...} }`
  - **Cast embed** (quote cast): `{ type: 'cast', cast_id: {...}, cast_hash: string, cast_text: string, cast_author: string }`

## Public Endpoints (No Auth Required)

### 1. Get Top Simps (Top Bidders)

**Endpoint:** `GET /analytics/top-bidders`

Get the biggest simps ranked by total number of bids. Each simp includes their top 5 favorite creators (who they bid on most).

**Query Parameters:**
- `limit` (optional): Number of results (default: 10, max: 100)

**Example Request:**
```javascript
const response = await fetch('http://localhost:8787/analytics/top-bidders?limit=20');
const data = await response.json();
```

**Example Response:**
```json
{
  "topBidders": [
    {
      "bidder_fid": 12345,
      "auctions_participated": 47,
      "total_bids": 156,
      "total_volume_cents": 250000,  // Total max bids across auctions in cents
      "highest_bid_cents": 10000,    // Highest single bid in cents
      "profile": {
        "fid": 12345,
        "username": "megasimp.eth",
        "displayName": "Mega Simp 🔥",
        "pfpUrl": "https://example.com/avatar.jpg",
        "followerCount": 5432,
        "followingCount": 123,
        "bio": "Professional simp since 2021",
        "primaryAddress": "0x123...",
        "powerBadge": true
      },
      "top_creators": [
        {
          "creator_fid": 9876,
          "auctions_bid_on": 25,        // Number of this creator's auctions they bid on
          "total_spent_cents": 50000,   // Total spent on this creator
          "highest_bid_cents": 5000,    // Highest bid on this creator
          "profile": {
            "fid": 9876,
            "username": "artcreator.eth",
            "displayName": "Art Creator",
            "pfpUrl": "https://example.com/creator.jpg"
          }
        }
        // ... up to 5 creators
      ]
    }
  ]
}
```

### 2. Get Hot Casts (Hall of Shame - Most Valuable Auctions)

**Endpoint:** `GET /analytics/hot-casts`

Get the most valuable casts sorted by highest bid amount. Perfect for the Hall of Shame main view.

**Query Parameters:**
- `limit` (optional): Number of results (default: 10)

**Example Request:**
```javascript
const response = await fetch('http://localhost:8787/analytics/hot-casts?limit=5');
const data = await response.json();
```

**Example Response with Complete Field Guide:**
```json
{
  "hotCasts": [
    {
      // IDENTIFIERS
      "id": 1,
      "castHash": "0xea0cf522b1d68d3ead3483a8ee0b51e0618d1547",
      
      // CREATOR INFO
      "creatorAddress": "0xabc...",
      "creatorFid": 9876,
      "creatorProfile": { /* Full Neynar profile */ },
      
      // AUCTION STATUS
      "state": 1,              // 1=Active, 2=Ended, 3=Settled
      "stateLabel": "Active",  // Human readable
      "isActive": true,
      "hasEnded": false,
      "timeLeftMs": 2100000,   // 0 if ended
      
      // BID STATISTICS
      "bidCount": 89,
      "uniqueBidders": 45,
      "highestBidCents": 50000,   // $500.00 - MAIN SORTING METRIC
      "lowestBidCents": 100,
      "averageBidCents": 5600,
      
      // TOP 3 SIMPS
      "top3Bidders": [
        {
          "bidderFid": 12345,
          "highestBidCents": 50000,
          "bidCount": 15,
          "profile": { /* Neynar profile */ }
        }
      ],
      
      // CAST CONTENT
      "castData": {
        "hash": "0xea0cf522b1d68d3ead3483a8ee0b51e0618d1547",
        "text": "Dropping my NFT! 🚀",
        "timestamp": "2024-01-19T09:00:00Z",
        "firstEmbed": { /* image/url/cast embed */ }
      }
    }
  ]
}
```

### 3. Get Recent Simp Activity

**Endpoint:** `GET /analytics/recent-activity`

See the latest simping activity in real-time.

**Query Parameters:**
- `limit` (optional): Number of results (default: 20)

**Example Request:**
```javascript
const response = await fetch('http://localhost:8787/analytics/recent-activity');
const data = await response.json();
```

**Example Response:**
```json
{
  "activity": [
    {
      "id": 1234,
      "cast_hash": "0xea0cf522b1d68d3ead3483a8ee0b51e0618d1547",
      "bidder_address": "0x123...",
      "bidder_fid": 12345,
      "amount_cents": 5000, // 50 USDC in cents
      "timestamp": "2024-01-20T14:30:00Z",
      "transaction_hash": "0xdef...",
      "auction_id": 1,
      "block_number": 33200700,
      "bidderProfile": {
        "fid": 12345,
        "username": "newsimp",
        "displayName": "New Simp",
        "pfpUrl": "https://example.com/simp.jpg"
      }
    }
  ]
}
```

### 4. Get Individual Simp Profile

**Endpoint:** `GET /analytics/user/:fid`

Get detailed simping history for a specific user.

**Example Request:**
```javascript
const fid = 12345;
const response = await fetch(`http://localhost:8787/analytics/user/${fid}`);
const data = await response.json();
```

**Example Response:**
```json
{
  "profile": {
    "fid": 12345,
    "username": "megasimp.eth",
    "displayName": "Mega Simp 🔥",
    "pfpUrl": "https://example.com/avatar.jpg",
    "followerCount": 5432,
    "followingCount": 123,
    "bio": "Professional simp since 2021",
    "primaryAddress": "0x123...",
    "powerBadge": true
  },
  "stats": {
    "auctions_participated": 47,
    "total_bids": 156,
    "total_volume_cents": 250000,
    "highest_bid_cents": 10000
  },
  "bids": [
    {
      "id": 789,
      "cast_hash": "0xea0cf522b1d68d3ead3483a8ee0b51e0618d1547",
      "amount_cents": 10000,
      "timestamp": "2024-01-20T14:30:00Z",
      "creator_fid": 9876
    }
  ]
}
```

### 5. Get All Auctions

**Endpoint:** `GET /auctions`

Get all auctions with basic stats.

**Query Parameters:**
- `limit` (optional): Number of results (default: 20)
- `offset` (optional): Pagination offset (default: 0)

**Example Request:**
```javascript
const response = await fetch('http://localhost:8787/auctions?limit=10&offset=0');
const data = await response.json();
```

### 6. Get Specific Auction Details

**Endpoint:** `GET /auctions/:castHash`

Get detailed information about a specific auction including all bids.

**Example Request:**
```javascript
const castHash = '0xea0cf522b1d68d3ead3483a8ee0b51e0618d1547';
const response = await fetch(`http://localhost:8787/auctions/${castHash}`);
const data = await response.json();
```

**Example Response:**
```json
{
  "id": 1,
  "cast_hash": "0xea0cf522b1d68d3ead3483a8ee0b51e0618d1547",
  "creator_address": "0xabc...",
  "creator_fid": 9876,
  "min_bid": "1000000",
  "end_time": "2024-01-20T15:30:00Z",
  "state": 1,
  "bid_count": "89",
  "highest_bid": "500000000",
  "creatorProfile": {
    "fid": 9876,
    "username": "creator",
    "displayName": "Creator",
    "pfpUrl": "https://example.com/creator.jpg"
  },
  "bids": [
    {
      "id": 1234,
      "bidder_address": "0x123...",
      "bidder_fid": 12345,
      "amount": "500000000",
      "timestamp": "2024-01-20T14:30:00Z",
      "bidderProfile": {
        "fid": 12345,
        "username": "topsimp",
        "displayName": "Top Simp",
        "pfpUrl": "https://example.com/simp.jpg"
      }
    }
  ]
}
```

### 7. Get Global Statistics

**Endpoint:** `GET /analytics/stats`

Get overall platform statistics for dashboard display.

**Example Request:**
```javascript
const response = await fetch('http://localhost:8787/analytics/stats');
const data = await response.json();
```

**Example Response:**
```json
{
  "totalSimps": 1234,
  "totalBids": 45678,
  "totalVolumeCents": 12500000, // Total USDC volume in cents
  "highestBidCents": 500000,    // Highest bid ever in cents
  "activeAuctions": 42,
  "endedAuctions": 892,
  "totalAuctions": 934
}
```

### 8. Get Time-based Leaderboards

**Endpoint:** `GET /analytics/top-bidders/timeframe`

Get top simps for specific time periods (daily/weekly/monthly champions). Each simp includes their top 5 favorite creators during that time period.

**Query Parameters:**
- `period`: "day", "week", "month", or "all-time" (default: "all-time")
- `limit`: Number of results (default: 10)

**Example Request:**
```javascript
const response = await fetch('http://localhost:8787/analytics/top-bidders/timeframe?period=week&limit=5');
const data = await response.json();
```

**Example Response:**
```json
{
  "topBidders": [
    {
      "bidder_fid": 12345,
      "auctions_participated": "15",
      "total_bids": "47",
      "total_volume": "850000000",
      "highest_bid": "100000000",
      "rank": 1,
      "period": "week",
      "profile": { /* Neynar profile data */ }
    }
  ],
  "period": "week"
}
```

### 9. Simp Battle Comparisons

**Endpoint:** `GET /analytics/simp-battles`

Compare two simps head-to-head to see who's the bigger simp.

**Query Parameters:**
- `user1`: First user's username (use this OR fid1)
- `user2`: Second user's username (use this OR fid2)
- `fid1`: First user's FID (use this OR user1)
- `fid2`: Second user's FID (use this OR user2)

**Example Requests:**
```javascript
// Using FIDs
const response = await fetch('http://localhost:8787/analytics/simp-battles?fid1=12345&fid2=67890');
const data = await response.json();

// Using usernames
const response2 = await fetch('http://localhost:8787/analytics/simp-battles?user1=vitalik.eth&user2=dwr.eth');
const data2 = await response2.json();

// Mix and match (username for user1, FID for user2)
const response3 = await fetch('http://localhost:8787/analytics/simp-battles?user1=vitalik.eth&fid2=12345');
const data3 = await response3.json();
```

**Example Response:**
```json
{
  "user1": {
    "fid": 12345,
    "profile": { /* Neynar profile */ },
    "stats": {
      "total_bids": "156",
      "total_volume": "2500000000",
      "highest_bid": "100000000"
    }
  },
  "user2": {
    "fid": 67890,
    "profile": { /* Neynar profile */ },
    "stats": {
      "total_bids": "89",
      "total_volume": "1200000000",
      "highest_bid": "75000000"
    }
  },
  "commonAuctions": {
    "total": 5,
    "auctions": [/* auction details where both bid */]
  },
  "winner": {
    "fid": 12345,
    "score": "3-0"
  }
}
```

### 10. Trending Data

**Endpoint:** `GET /analytics/trending`

Get hot auctions and rising simps.

**Example Request:**
```javascript
const response = await fetch('http://localhost:8787/analytics/trending');
const data = await response.json();
```

**Example Response:**
```json
{
  "hotAuctions": [
    {
      "cast_hash": "0xabc...",
      "creator_fid": 9876,
      "recent_bid_count": "25",
      "highest_recent_bid": "500000000",
      "unique_recent_bidders": "18"
    }
  ],
  "risingSimps": [
    {
      "bidder_fid": 12345,
      "recent_bids": "45",
      "recent_volume": "750000000",
      "growth_percentage": "450.5",
      "profile": { /* Neynar profile */ }
    }
  ]
}
```

### 11. Simp Level Calculator

**Endpoint:** `GET /analytics/simp-level/:fid`

Get detailed simp level, achievements, and progress for a user.

**Example Request:**
```javascript
const response = await fetch('http://localhost:8787/analytics/simp-level/12345');
const data = await response.json();
```

**Example Response:**
```json
{
  "fid": 12345,
  "profile": { /* Neynar profile */ },
  "level": "Mega Simp",
  "emoji": "🔥",
  "stats": {
    "total_bids": "156",
    "total_volume": "2500000000"
  },
  "rank": {
    "bidRank": 23,
    "volumeRank": 18,
    "totalSimps": 1234
  },
  "percentile": "Top 1.9%",
  "achievements": [
    {
      "name": "Century Club",
      "emoji": "💯",
      "description": "100 bids placed"
    },
    {
      "name": "Whale",
      "emoji": "🐋",
      "description": "$1000+ spent"
    }
  ],
  "nextMilestone": {
    "name": "Reach 500 total bids",
    "requirement": 500,
    "current": 156,
    "type": "bids"
  }
}
```

### 12. Creator Statistics

**Endpoint:** `GET /analytics/creator-stats/:fid`

Get statistics for content creators - who attracts the most simps.

**Example Request:**
```javascript
const response = await fetch('http://localhost:8787/analytics/creator-stats/9876');
const data = await response.json();
```

**Example Response:**
```json
{
  "creator": {
    "fid": 9876,
    "profile": { /* Neynar profile */ }
  },
  "auctionStats": {
    "total_auctions": "45",
    "active_auctions": "3",
    "ended_auctions": "42",
    "total_fees_earned": "125000000"
  },
  "biddingStats": {
    "unique_simps": "234",
    "total_bids_received": "1567",
    "total_volume": "8900000000",
    "highest_bid_received": "500000000",
    "average_bid": "5678000"
  },
  "topSimps": [
    {
      "bidder_fid": 12345,
      "bid_count": "89",
      "total_spent": "1200000000",
      "profile": { /* Neynar profile */ }
    }
  ],
  "recentAuctions": [/* recent auction data */]
}
```

### 13. Outbid History (Rivalry Tracker)

**Endpoint:** `GET /analytics/outbid-history/:fid`

Track bidding rivalries - who outbids whom most often.

**Example Request:**
```javascript
const response = await fetch('http://localhost:8787/analytics/outbid-history/12345');
const data = await response.json();
```

**Example Response:**
```json
{
  "user": {
    "fid": 12345,
    "profile": { /* Neynar profile */ }
  },
  "outbidByUser": {
    "total": 8,
    "victims": [
      {
        "victim_fid": 67890,
        "times_outbid": "23",
        "total_outbid_amount": "450000000",
        "profile": { /* Neynar profile */ }
      }
    ]
  },
  "outbidThisUser": {
    "total": 5,
    "rivals": [
      {
        "rival_fid": 54321,
        "times_been_outbid": "17",
        "total_outbid_amount": "380000000",
        "profile": { /* Neynar profile */ }
      }
    ]
  },
  "biggestRival": {
    "fid": 54321,
    "profile": { /* Neynar profile */ },
    "totalInteractions": 40
  }
}
```

### 14. Hot Users (Creators with Most Revenue)

**Endpoint:** `GET /analytics/hot-users`

Get the creators who have earned the most money from auctions.

**Query Parameters:**
- `limit` (optional): Number of results (default: 20)

**Example Request:**
```javascript
const response = await fetch('http://localhost:8787/analytics/hot-users?limit=10');
const data = await response.json();
```

**Example Response:**
```json
{
  "hotUsers": [
    {
      "creator_fid": 9876,
      "profile": {
        "fid": 9876,
        "username": "artcreator.eth",
        "displayName": "Art Creator 🎨",
        "pfpUrl": "https://example.com/creator.jpg",
        "followerCount": 10234,
        "bio": "Creating digital art on Farcaster",
        "powerBadge": true
      },
      "stats": {
        "total_revenue_cents": 5000000,        // $50,000 total earned
        "total_auctions": 45,                  // Created 45 auctions
        "settled_auctions": 42,                // 42 completed auctions
        "unique_simps": 234,                   // 234 unique bidders
        "total_bids_received": 1567,           // Total bids on all auctions
        "highest_auction_revenue_cents": 500000, // $5,000 from one auction
        "avg_auction_revenue_cents": 119047     // $1,190.47 average per auction
      },
      "recent_auctions": [
        {
          "cast_hash": "0xabc123...",
          "end_time": "2024-01-20T15:30:00Z",
          "state": 3,                          // 1=Active, 2=Ended, 3=Settled
          "revenue_cents": 250000,             // $2,500 from this auction
          "bid_count": 89,
          "castData": {
            "hash": "0xabc123...",
            "text": "New NFT drop! 🚀",
            "timestamp": "2024-01-19T09:00:00Z",
            "firstEmbed": { /* image/url/cast */ }
          }
        }
        // ... up to 3 recent auctions
      ]
    }
    // ... more creators
  ]
}
```

**Use Cases:**
- Leaderboard of most successful creators
- Discovery of popular content creators
- Analytics for creators to benchmark their performance
- Identifying creators with engaged audiences

### 15. P2P Transfers (Secondary Market)

**Endpoint:** `GET /analytics/p2p-transfers`

Get recent peer-to-peer NFT transfers between users (excludes auction settlements and mints).

**Query Parameters:**
- `limit` (optional): Number of results (default: 20)
- `offset` (optional): Pagination offset (default: 0)

**Example Request:**
```javascript
const response = await fetch('http://localhost:8787/analytics/p2p-transfers?limit=10');
const data = await response.json();
```

**Example Response:**
```json
{
  "transfers": [
    {
      "id": 123,
      "from_address": "0x6177801f3b87aE8Ea2f61bD80e7Cff0bdC4f7e71",
      "from_fid": null,              // Would be populated if address mapping exists
      "fromProfile": null,            // Would include Neynar profile if FID known
      "to_address": "0x8D7f598347e1D526e02E51e663BA837393068e6e",
      "to_fid": null,                
      "toProfile": null,              
      "token_id": "1355546828722860882707695660281420262485418087070",
      "transaction_hash": "0xabc123...",
      "block_number": 12345678,
      "timestamp": "2024-01-20T15:45:00Z",
      "explorer_url": "https://basescan.org/tx/0xabc123...",
      "opensea_url": "https://opensea.io/assets/base/0xc011ec7ca575d4f0a2eda595107ab104c7af7a09/1355546..."
    }
    // ... more transfers
  ],
  "pagination": {
    "total": 156,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

**Use Cases:**
- Track secondary market activity
- See who's trading NFTs peer-to-peer
- Monitor transfer patterns outside of auctions
- Build transfer history timelines

**Note:** Address to FID mapping would need to be implemented for full profile enrichment.

### 16. Top Winning Casts (Highest Winning Bids)

**Endpoint:** `GET /analytics/top-winning-casts`

Get settled auctions ordered by highest winning bid amounts. Shows the most valuable casts that have been collected.

**Query Parameters:**
- `limit` (optional): Number of results (default: 20)
- `offset` (optional): Pagination offset (default: 0)

**Example Request:**
```javascript
const response = await fetch('http://localhost:8787/analytics/top-winning-casts?limit=10');
const data = await response.json();
```

**Example Response:**
```json
{
  "casts": [
    {
      "id": 456,
      "castHash": "0xabc123...",
      "creatorAddress": "0x123...",
      "creatorFid": 12345,
      "creatorProfile": { /* Neynar user profile */ },
      "winnerAddress": "0x456...",
      "winnerFid": 67890,
      "winnerProfile": { /* Neynar user profile */ },
      "winningBidCents": 500000,  // $5000.00
      "minBidCents": 100,
      "totalBids": 45,
      "uniqueBidders": 23,
      "endTime": "2024-01-20T15:00:00Z",
      "createdAt": "2024-01-18T10:00:00Z",
      "transactionHash": "0xdef456...",
      "castData": { /* Neynar cast content */ }
    }
    // ... more casts
  ],
  "pagination": {
    "total": 250,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

**Use Cases:**
- Display most valuable NFT casts
- Track record-breaking sales
- Showcase premium content
- Analyze high-value auction patterns

### 17. Top Collectors (Most Active Collectors)

**Endpoint:** `GET /analytics/top-collectors`

Get users who have collected the most casts, with detailed stats and recent collection history.

**Query Parameters:**
- `limit` (optional): Number of results (default: 20)

**Example Request:**
```javascript
const response = await fetch('http://localhost:8787/analytics/top-collectors?limit=10');
const data = await response.json();
```

**Example Response:**
```json
{
  "collectors": [
    {
      "collectorFid": 12345,
      "collectorProfile": { /* Neynar user profile */ },
      "stats": {
        "castsCollected": 156,
        "totalSpentCents": 2500000,  // $25,000.00
        "avgPriceCents": 16025,      // $160.25
        "highestPriceCents": 500000,  // $5,000.00
        "lowestPriceCents": 100       // $1.00
      },
      "recentCollections": [
        {
          "castHash": "0xabc123...",
          "creatorFid": 67890,
          "creatorProfile": { /* Neynar user profile */ },
          "winningBidCents": 50000,
          "endTime": "2024-01-20T15:00:00Z",
          "createdAt": "2024-01-18T10:00:00Z",
          "castData": { /* Neynar cast content */ }
        }
        // ... up to 5 recent collections
      ],
      "topCreatorsCollected": [
        {
          "creatorFid": 67890,
          "creatorProfile": { /* Neynar user profile */ },
          "castsFromCreator": 23,
          "spentOnCreatorCents": 345000  // $3,450.00
        }
        // ... top 3 creators they collect from
      ]
    }
    // ... more collectors
  ]
}
```

**Use Cases:**
- Identify top collectors/patrons
- Analyze collector preferences
- Track collector spending patterns
- Build collector leaderboards

### 18. Top Collected Creators (Most Collected Casters)

**Endpoint:** `GET /analytics/top-collected-creators`

Get creators whose casts have been collected the most, with revenue stats and top collectors.

**Query Parameters:**
- `limit` (optional): Number of results (default: 20)

**Example Request:**
```javascript
const response = await fetch('http://localhost:8787/analytics/top-collected-creators?limit=10');
const data = await response.json();
```

**Example Response:**
```json
{
  "creators": [
    {
      "creatorFid": 67890,
      "creatorProfile": { /* Neynar user profile */ },
      "stats": {
        "castsCollected": 89,
        "totalRevenueCents": 1250000,  // $12,500.00
        "avgPriceCents": 14044,        // $140.44
        "highestPriceCents": 500000,    // $5,000.00
        "lowestPriceCents": 100,        // $1.00
        "uniqueCollectors": 45
      },
      "recentCollectedCasts": [
        {
          "castHash": "0xabc123...",
          "winnerFid": 12345,
          "winnerProfile": { /* Neynar user profile */ },
          "winningBidCents": 50000,
          "endTime": "2024-01-20T15:00:00Z",
          "createdAt": "2024-01-18T10:00:00Z",
          "castData": { /* Neynar cast content */ }
        }
        // ... up to 5 recent collected casts
      ],
      "topCollectors": [
        {
          "collectorFid": 12345,
          "collectorProfile": { /* Neynar user profile */ },
          "timesCollected": 12,
          "revenueFromCollectorCents": 234000  // $2,340.00
        }
        // ... top 3 collectors
      ]
    }
    // ... more creators
  ]
}
```

**Use Cases:**
- Identify successful content creators
- Track creator revenue and performance
- Analyze collector-creator relationships
- Build creator leaderboards

### 19. Hall of Shame User Profile (All-in-One Popup Data)

**Endpoint:** `GET /analytics/hall-of-shame/:fid`

🎆 **CONSOLIDATED ENDPOINT WITH CACHING** - Get everything needed for a user's Hall of Shame popup in ONE API call. Now includes recent bids and 4-minute caching for blazing fast performance!

**Use Case:** When user clicks on a simp in the Hall of Shame, show a detailed popup with all their simping data.

**Performance:** Cached for 4 minutes, response times <50ms after first load.

**Example Request:**
```javascript
const response = await fetch('http://localhost:8787/analytics/hall-of-shame/12345');
const data = await response.json();
```

**Example Response with Complete Field Guide:**
```json
{
  // === USER IDENTITY ===
  "user": {
    "fid": 12345,
    "profile": {
      "fid": 12345,
      "username": "megasimp.eth",
      "displayName": "Mega Simp 🔥",
      "pfpUrl": "https://example.com/avatar.jpg",
      "followerCount": 5432,
      "bio": "Professional simp since 2021",
      "powerBadge": true
    },
    "simpLevel": {
      "level": "Mega Simp",     // Their simp tier
      "emoji": "🔥",            // Emoji for the tier
      "totalBids": 156          // Used to calculate level
    }
  },
  
  // === SPENDING STATISTICS ===
  "stats": {
    "auctionsParticipated": 47,   // Number of unique auctions
    "totalBids": 156,              // Total bids placed
    "totalVolumeCents": 250000,    // $2,500.00 total spent
    "highestBidCents": 50000,      // $500.00 highest single bid
    "firstBidDate": "2023-06-15T10:00:00Z",  // Simping since...
    "lastBidDate": "2024-01-20T14:55:00Z",   // Last active
    "bidRank": 15,                 // #15 by bid count
    "volumeRank": 8                 // #8 by spending
  },
  
  // === TOP 10 CREATORS THEY SIMP FOR ===
  "topCreators": [
    {
      "creatorFid": 9876,
      "auctionsBidOn": 25,        // Bid on 25 of their casts
      "totalSpentCents": 125000,   // $1,250.00 on this creator
      "highestBidCents": 25000,    // $250.00 max bid
      "totalBidsPlaced": 87,       // 87 total bids on their casts
      "profile": {
        "fid": 9876,
        "username": "artcreator.eth",
        "displayName": "Art Creator 🎨",
        "pfpUrl": "https://example.com/creator.jpg"
      }
    }
    // ... up to 10 creators
  ],
  
  // === TOP 5 CASTS THEY'VE BID ON MOST ===
  "mostBidCasts": [
    {
      "auctionId": 123,
      "castHash": "0xabc123...",
      "creatorFid": 9876,
      "endTime": "2024-01-20T15:30:00Z",
      "state": 2,                   // 1=Active, 2=Ended, 3=Settled
      "userBidCount": 23,           // They bid 23 times on this!
      "userHighestBidCents": 25000, // Their max bid: $250.00
      "firstBidTime": "2024-01-19T10:00:00Z",  // When they started
      "lastBidTime": "2024-01-20T14:30:00Z",   // Last bid
      "auctionHighestBidCents": 50000,         // Someone else bid $500
      "totalAuctionBids": 156,                 // Total bids by everyone
      "creatorProfile": { /* Creator's Neynar profile */ },
      "castData": {
        "hash": "0xabc123...",
        "text": "My amazing NFT drop! 🚀",
        "timestamp": "2024-01-19T09:00:00Z",
        "firstEmbed": { /* image/url/cast */ }
      }
    }
    // ... up to 5 casts
  ],
  
  // === 🆕 RECENT BIDDING ACTIVITY (NEW!) ===
  "recentBids": [
    {
      "auctionId": 456,
      "castHash": "0xdef456...",
      "creatorFid": 7890,
      "amountCents": 15000,         // $150.00 bid
      "timestamp": "2024-01-20T14:55:00Z",
      "transactionHash": "0x123abc...",
      "auctionEndTime": "2024-01-20T16:00:00Z",
      "auctionState": 1,            // 1=Active, 2=Ended, 3=Settled
      "creatorProfile": { /* Creator's Neynar profile */ },
      "castData": {
        "hash": "0xdef456...",
        "text": "Limited edition drop! 💎",
        "timestamp": "2024-01-20T08:00:00Z",
        "firstEmbed": { /* image/url/cast */ }
      }
    }
    // ... up to 20 most recent bids
  ]
}
```

**Frontend Popup Design Recommendations:**

1. **Header Section:**
   - Large profile picture
   - Username + display name
   - Simp level badge with emoji
   - Follower count + power badge

2. **Stats Overview (Grid Layout):**
   - Total Spent: Format as "$2,500.00" 
   - Total Bids: "156 bids"
   - Rank: "#8 by spending" 
   - Active Since: "Jun 2023"

3. **"Simps For" Section:**
   - Title: "Top 5 Creators They Simp For"
   - List with creator avatars, names, and spending
   - Show as: "@artcreator.eth - $1,250 (25 auctions)"

4. **"Most Obsessed With" Section:**
   - Title: "Casts They Can't Stop Bidding On"
   - Show cast preview with embed image
   - Highlight bid count: "Bid 23 times! (Max: $250)"
   - Show if they're winning/losing

5. **Call-to-Actions:**
   - "View Full Profile" - links to their simp profile page
   - "Battle This Simp" - opens simp battle with them
   - Each cast/creator clickable to view details

## Protected Endpoints (Requires JWT)

### Authentication

Protected endpoints require a JWT token from Farcaster Quick Auth. Include it in the Authorization header:

```javascript
const headers = {
  'Authorization': `Bearer ${jwtToken}`
};
```

### Get My Simp Stats

**Endpoint:** `GET /me`

Get your own simping statistics.

**Example Request:**
```javascript
const response = await fetch('http://localhost:8787/me', {
  headers: {
    'Authorization': `Bearer ${jwtToken}`
  }
});
const data = await response.json();
```

## Frontend Implementation Tips

### 1. Formatting USDC Amounts

All amounts are now returned in cents for easier handling. Here's a helper function:

```javascript
function formatUSDC(cents) {
  const value = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

// Example: 50000 -> "$500.00"
```

### 2. Simp Ranking System

Create a ranking system based on different metrics:

```javascript
// Simp levels based on total bids
function getSimpLevel(totalBids) {
  if (totalBids >= 100) return { level: 'Giga Simp', emoji: '👑' };
  if (totalBids >= 50) return { level: 'Mega Simp', emoji: '🔥' };
  if (totalBids >= 20) return { level: 'Super Simp', emoji: '💪' };
  if (totalBids >= 10) return { level: 'Simp Pro', emoji: '⭐' };
  if (totalBids >= 5) return { level: 'Simp', emoji: '💖' };
  return { level: 'Simp Rookie', emoji: '🌱' };
}
```

### 3. Real-time Updates

Poll the recent activity endpoint to show live simping:

```javascript
function startActivityPolling() {
  setInterval(async () => {
    const response = await fetch('/analytics/recent-activity?limit=5');
    const data = await response.json();
    updateActivityFeed(data.activity);
  }, 10000); // Poll every 10 seconds
}
```

### 4. Leaderboard Components

Example React component structure:

```javascript
// TopSimpsLeaderboard.jsx
function TopSimpsLeaderboard() {
  const [simps, setSimps] = useState([]);
  
  useEffect(() => {
    fetch('/analytics/top-bidders?limit=50')
      .then(res => res.json())
      .then(data => setSimps(data.topBidders));
  }, []);
  
  return (
    <div className="leaderboard">
      <h2>🏆 Top Simps Hall of Fame</h2>
      {simps.map((simp, index) => (
        <div key={simp.bidder_fid} className="simp-row">
          <span className="rank">#{index + 1}</span>
          <img src={simp.profile.pfpUrl} alt={simp.profile.username} />
          <div className="simp-info">
            <h3>{simp.profile.displayName}</h3>
            <p>@{simp.profile.username}</p>
            <div className="stats">
              <span>{simp.total_bids} bids</span>
              <span>{formatUSDC(simp.total_volume)} spent</span>
            </div>
          </div>
          <div className="simp-level">
            {getSimpLevel(simp.total_bids).emoji}
          </div>
        </div>
      ))}
    </div>
  );
}
```

### 5. Cast Hash Handling

Cast hashes can be provided in either format:
- Padded (64 chars): `0x000000000000000000000000ea0cf522b1d68d3ead3483a8ee0b51e0618d1547`
- Unpadded (40 chars): `0xea0cf522b1d68d3ead3483a8ee0b51e0618d1547`

The API accepts both formats for the `/auctions/:castHash` endpoint.

### 6. Error Handling

```javascript
async function fetchWithErrorHandling(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    // Show user-friendly error message
    return null;
  }
}
```

## Rate Limiting

The API is deployed on Cloudflare Workers with generous limits, but please be respectful:
- Cache responses when possible
- Use appropriate polling intervals (10+ seconds)
- Batch requests when fetching multiple user profiles

## Example Features for Simps R Us

1. **Main Dashboard**: 
   - Global stats widget showing total simps, volume, and active auctions
   - Live activity feed with real-time bidding updates
   - Trending section with hot auctions and rising simps

2. **Leaderboards**:
   - All-time Hall of Fame
   - Time-based leaderboards (Simp of the Day/Week/Month)
   - Toggle between bid count and volume rankings

3. **Simp Profiles**:
   - Detailed user pages with simp level, achievements, and progress bars
   - Bidding history timeline
   - Rivalry tracker showing their biggest competitors
   - Next milestone gamification

4. **Battle Mode**:
   - Head-to-head simp comparisons
   - Shareable battle results
   - Common auctions where they competed

5. **Creator Analytics**:
   - Which creators attract the most simps
   - Top simps for each creator
   - Creator earnings and auction performance

6. **Rivalry Features**:
   - "Nemesis" badges for biggest rivals
   - Outbid notifications and drama tracking
   - Revenge bid suggestions

7. **Achievement System**:
   - Visual badges for milestones
   - Progress tracking to next achievement
   - Rarity indicators

8. **Time-based Competitions**:
   - "Simp of the Month" contests
   - Rising star leaderboards
   - Growth percentage tracking

## Support

For API issues or questions, please open an issue on GitHub.