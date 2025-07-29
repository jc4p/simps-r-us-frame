# Simps R Us API - NFT Bidding Tracker

A high-performance Cloudflare Workers API that tracks bidding activity on Farcaster collectible cast auctions. Built for "Simps R Us" - a leaderboard app celebrating the most dedicated bidders (simps) in the Farcaster ecosystem.

## Overview

This API monitors two contracts on Base:
- **Auction contract** (`0xFC52e33F48Dd3fcd5EE428c160722efda645D74A`) - Tracks auction starts and bids
- **NFT contract** (`0xc011Ec7Ca575D4f0a2eDA595107aB104c7Af7A09`) - Tracks Transfer events for peer-to-peer trading

It provides comprehensive analytics, leaderboards, gamification features, and P2P trading data.

### Volume Calculation

Volume metrics track the maximum bid each user places per auction, not the sum of all bids. For example:
- If a user bids $1, $2, then $3 on the same auction, their volume for that auction is $3 (not $6)
- This reflects the actual amount they're willing to spend, not bid escalation in bidding wars

## Features

- 🏆 **Leaderboards** - All-time and time-based rankings
- 📊 **Analytics** - Global stats, trending data, and user metrics
- 🎮 **Gamification** - Simp levels, achievements, and milestones
- ⚔️ **Battle Mode** - Head-to-head simp comparisons
- 👿 **Rivalry Tracking** - See who outbids whom
- 👤 **Rich Profiles** - Integrated with Neynar for user data
- ⚡ **Real-time Sync** - Automatic blockchain event syncing every 5 minutes

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono
- **Database**: PostgreSQL (Neon) with optimized indexes
- **Blockchain**: Viem for Base network
- **Auth**: Farcaster Quick Auth (JWT)
- **User Data**: Neynar API with KV caching
- **Caching**: Cloudflare KV for Neynar API responses

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd simps-frame/api

# Install dependencies
bun install

# Set up environment variables
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your credentials

# Run database migrations
psql $DATABASE_URL < schema.sql

# Apply performance indexes
psql $DATABASE_URL < indexes.sql

# Apply P2P transfers schema
psql $DATABASE_URL < transfers_schema.sql

# Run historical data backfill
bun run backfill

# Run P2P transfers backfill  
node scripts/backfill-transfers.js

# Start development server
bun run dev
```

## Environment Variables

Create a `.dev.vars` file with:

```env
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/your-key
NEYNAR_API_KEY=your-neynar-api-key
HOSTNAME=localhost:8787
```

## API Routes

### Public Analytics Endpoints

#### Global Statistics
```bash
GET /analytics/stats
```

Get platform-wide statistics including total simps, bids, and volume.

**Example:**
```bash
curl http://localhost:8787/analytics/stats
```

**Response:**
```json
{
  "totalSimps": 1234,
  "totalBids": 45678,
  "totalVolumeCents": 12500000,
  "highestBidCents": 500000,
  "activeAuctions": 42,
  "endedAuctions": 892,
  "totalAuctions": 934
}
```

#### Top Bidders
```bash
GET /analytics/top-bidders
GET /analytics/top-bidders/timeframe?period=day|week|month|all-time&limit=10
```

Get leaderboards of top simps by bid count and volume. Volume is calculated using the highest bid per auction per user.

**Example:**
```bash
# All-time top 10
curl http://localhost:8787/analytics/top-bidders

# This week's top 20
curl "http://localhost:8787/analytics/top-bidders/timeframe?period=week&limit=20"
```

#### Trending Data
```bash
GET /analytics/trending
```

Get hot auctions (most bids in 24h) and rising simps (highest growth).

**Example:**
```bash
curl http://localhost:8787/analytics/trending
```

#### User Profile & Stats
```bash
GET /analytics/user/:fid
```

Get comprehensive user statistics and bidding history.

**Example:**
```bash
curl http://localhost:8787/analytics/user/977233
```

#### Simp Level Calculator
```bash
GET /analytics/simp-level/:fid
```

Get user's simp level, achievements, rank, and progress.

**Example:**
```bash
curl http://localhost:8787/analytics/simp-level/977233
```

**Response includes:**
- Simp level (Rookie → Omega)
- Achievements unlocked
- Percentile ranking
- Next milestone progress

#### Simp Battles
```bash
GET /analytics/simp-battles
```

Compare two simps head-to-head. Use `user1`/`user2` for usernames or `fid1`/`fid2` for FIDs.

**Parameters:**
- `user1`, `user2`: Usernames to compare
- `fid1`, `fid2`: FIDs to compare

**Examples:**
```bash
# Using FIDs
curl "http://localhost:8787/analytics/simp-battles?fid1=977233&fid2=12345"

# Using usernames  
curl "http://localhost:8787/analytics/simp-battles?user1=vitalik.eth&user2=dwr.eth"

# Mix and match
curl "http://localhost:8787/analytics/simp-battles?user1=vitalik.eth&fid2=12345"
```

#### Creator Statistics
```bash
GET /analytics/creator-stats/:fid
```

Get stats for content creators - who attracts the most simps.

**Example:**
```bash
curl http://localhost:8787/analytics/creator-stats/977233
```

#### Outbid History (Rivalries)
```bash
GET /analytics/outbid-history/:fid
```

Track bidding rivalries and see biggest competitors.

**Example:**
```bash
curl http://localhost:8787/analytics/outbid-history/977233
```

### Auction Endpoints

#### List All Auctions
```bash
GET /auctions?limit=20&offset=0
```

#### Get Specific Auction
```bash
GET /auctions/:castHash
```

**Example:**
```bash
curl http://localhost:8787/auctions/0xea0cf522b1d68d3ead3483a8ee0b51e0618d1547
```

#### Recent Activity
```bash
GET /analytics/recent-activity?limit=20
```

#### Hot Casts
```bash
GET /analytics/hot-casts?limit=10
```

Get the most valuable casts sorted by highest bid amount.

#### Hot Users (Creators with Most Revenue)
```bash
GET /analytics/hot-users?limit=20
```

Get creators ranked by total money earned from their auctions.

**Example:**
```bash
curl http://localhost:8787/analytics/hot-users?limit=10
```

#### Hall of Shame User Profile
```bash
GET /analytics/hall-of-shame/:fid
```

Get comprehensive user data for Hall of Shame popup display - combines stats, top creators, and most bid casts in one call.

**Example:**
```bash
curl http://localhost:8787/analytics/hall-of-shame/977233
```

#### P2P Transfers
```bash
GET /analytics/p2p-transfers?limit=20&offset=0
```

Get recent peer-to-peer NFT transfers (excludes auction settlements and mints).

**Example:**
```bash
curl http://localhost:8787/analytics/p2p-transfers
```

**Response:**
```json
{
  "transfers": [
    {
      "id": 123,
      "from_address": "0x6177801f3b87aE8Ea2f61bD80e7Cff0bdC4f7e71",
      "from_fid": null,
      "fromProfile": null,
      "to_address": "0x8D7f598347e1D526e02E51e663BA837393068e6e",
      "to_fid": null,
      "toProfile": null,
      "token_id": "1355546828722860882707695660281420262485418087070",
      "transaction_hash": "0x...",
      "block_number": 12345678,
      "timestamp": "2024-01-01T00:00:00Z",
      "explorer_url": "https://basescan.org/tx/0x...",
      "opensea_url": "https://opensea.io/assets/base/0xc011ec7ca575d4f0a2eda595107ab104c7af7a09/..."
    }
  ],
  "pagination": {
    "total": 100,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

### Protected Endpoints (Requires JWT)

#### Get My Stats
```bash
GET /me
Authorization: Bearer <jwt-token>
```

#### Manual Sync Trigger
```bash
POST /sync
Authorization: Bearer <jwt-token>
```

## Simp Levels

The API calculates simp levels based on total bids:

| Level | Emoji | Bids Required |
|-------|-------|---------------|
| Simp Rookie | 🌱 | 1-4 |
| Simp | 💖 | 5-9 |
| Simp Pro | ⭐ | 10-19 |
| Super Simp | 💪 | 20-49 |
| Mega Simp | 🔥 | 50-99 |
| Giga Simp | 👑 | 100-499 |
| Ultra Simp | 💎 | 500-999 |
| Omega Simp | 🌟 | 1000+ |

## Achievements

Users unlock achievements for various milestones:

- **First Steps** (👣) - Place first bid
- **Getting Serious** (💯) - 10 bids placed
- **Dedicated Simp** (🎯) - 50 bids placed
- **Century Club** (💯) - 100 bids placed
- **Big Spender** (💰) - $100+ total spent
- **Whale** (🐋) - $1000+ total spent
- **High Roller** (🎰) - $50+ single bid

## Development

### Running Locally
```bash
# Start dev server with hot reload
bun run dev

# Run tests
bun test
```

### Deployment
```bash
# Create KV namespace for caching
wrangler kv:namespace create "NEYNAR_CACHE"
# Update wrangler.toml with the namespace ID from the output

# Deploy to Cloudflare Workers
bun run deploy
```

### Database Management

The API uses PostgreSQL with three main tables:
- `auctions` - Stores auction metadata
- `bids` - Stores all bid events
- `sync_status` - Tracks blockchain sync progress

### Blockchain Sync

The API automatically syncs new events every 5 minutes via Cloudflare cron triggers. You can also manually trigger a sync using the protected `/sync` endpoint.

## Scripts

- `bun run dev` - Start development server
- `bun run deploy` - Deploy to production
- `bun run backfill` - Backfill historical blockchain data
- `bun test` - Run test suite

## Rate Limits

The API is deployed on Cloudflare Workers with generous limits:
- 100,000 requests/day (free tier)
- 10 million requests/month (paid tier)
- No rate limiting implemented at API level

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│                 │     │              │     │             │
│  Frontend App   │────▶│  Workers API │────▶│ PostgreSQL  │
│  (Simps R Us)   │     │    (Hono)    │     │   (Neon)    │
│                 │     │              │     │             │
└─────────────────┘     └──────┬───────┘     └─────────────┘
                               │
                               │
                        ┌──────▼───────┐
                        │              │
                        │ Base Network │
                        │  (Contract)  │
                        │              │
                        └──────────────┘
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Support

For API issues or questions, please open an issue on GitHub.