// Test script to verify volume calculations
import pg from 'pg';

const { Pool } = pg;

async function testVolumeCalculation() {
  // Connect to database
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Find a user with many bids
    const testUserResult = await pool.query(`
      SELECT bidder_fid, COUNT(*) as bid_count
      FROM bids
      GROUP BY bidder_fid
      ORDER BY bid_count DESC
      LIMIT 5
    `);

    console.log('Top 5 users by bid count:');
    for (const user of testUserResult.rows) {
      const fid = user.bidder_fid;
      
      // Get detailed stats
      const detailedResult = await pool.query(`
        WITH bid_details AS (
          SELECT 
            auction_id,
            COUNT(*) as bids_per_auction,
            MIN(amount) as min_bid,
            MAX(amount) as max_bid,
            SUM(amount) as sum_all_bids,
            STRING_AGG(amount::text, ', ' ORDER BY timestamp) as bid_sequence
          FROM bids
          WHERE bidder_fid = $1
          GROUP BY auction_id
        )
        SELECT 
          COUNT(*) as auction_count,
          SUM(bids_per_auction) as total_bids,
          SUM(max_bid) as total_volume_correct,
          SUM(sum_all_bids) as total_volume_wrong,
          MAX(max_bid) as highest_bid,
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'auction_id', auction_id,
              'bids', bids_per_auction,
              'min', min_bid,
              'max', max_bid,
              'sum', sum_all_bids,
              'sequence', bid_sequence
            ) ORDER BY bids_per_auction DESC
          ) as auction_details
        FROM bid_details
      `, [fid]);

      const stats = detailedResult.rows[0];
      console.log(`\nUser FID ${fid}:`);
      console.log(`  Total bids: ${stats.total_bids}`);
      console.log(`  Auctions participated: ${stats.auction_count}`);
      console.log(`  Highest single bid: ${(BigInt(stats.highest_bid) / 10000n).toString()} cents ($${(Number(stats.highest_bid) / 1000000).toFixed(2)})`);
      console.log(`  Volume (correct - max per auction): ${(BigInt(stats.total_volume_correct) / 10000n).toString()} cents ($${(Number(stats.total_volume_correct) / 1000000).toFixed(2)})`);
      console.log(`  Volume (wrong - sum all bids): ${(BigInt(stats.total_volume_wrong) / 10000n).toString()} cents ($${(Number(stats.total_volume_wrong) / 1000000).toFixed(2)})`);
      console.log(`  Difference: $${((Number(stats.total_volume_wrong) - Number(stats.total_volume_correct)) / 1000000).toFixed(2)}`);
      
      // Show top 3 auctions with most bids
      const details = JSON.parse(stats.auction_details);
      console.log(`  Top 3 auctions by bid count:`);
      for (let i = 0; i < Math.min(3, details.length); i++) {
        const auction = details[i];
        console.log(`    Auction ${auction.auction_id}: ${auction.bids} bids, max $${(Number(auction.max) / 1000000).toFixed(2)}, sum $${(Number(auction.sum) / 1000000).toFixed(2)}`);
        console.log(`      Bid sequence: ${auction.sequence.split(', ').map(b => '$' + (Number(b) / 1000000).toFixed(2)).join(', ')}`);
      }
    }

    // Test the actual query from the API
    console.log('\n\nTesting API query for top user:');
    const topFid = testUserResult.rows[0].bidder_fid;
    
    const apiQueryResult = await pool.query(`
      WITH max_bids_per_auction AS (
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
      WHERE b.bidder_fid = $1
    `, [topFid]);

    const apiStats = apiQueryResult.rows[0];
    console.log(`API query results for FID ${topFid}:`);
    console.log(`  Auctions: ${apiStats.auctions_participated}`);
    console.log(`  Total bids: ${apiStats.total_bids}`);
    console.log(`  Volume: ${(BigInt(apiStats.total_volume) / 10000n).toString()} cents ($${(Number(apiStats.total_volume) / 1000000).toFixed(2)})`);
    console.log(`  Highest bid: ${(BigInt(apiStats.highest_bid) / 10000n).toString()} cents ($${(Number(apiStats.highest_bid) / 1000000).toFixed(2)})`);

  } finally {
    await pool.end();
  }
}

// Run the test
testVolumeCalculation().catch(console.error);