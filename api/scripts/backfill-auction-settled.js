import dotenv from 'dotenv';
import { createViemClient, CONTRACT_ADDRESS, AUCTION_SETTLED_ABI, parseAuctionSettledEvent } from '../src/contract.js';
import { getDbClient } from '../src/db.js';
import { formatCastHash } from '../src/utils.js';
import { decodeEventLog } from 'viem';

// Load environment variables
dotenv.config({ path: '.dev.vars' });

const BATCH_SIZE = 500n;
const DELAY_MS = 100; // Delay between batches to avoid rate limits

async function processAuctionSettledEvent(client, event) {
  const data = parseAuctionSettledEvent(event);
  
  // Update the auction state to settled (3) and store winner information
  // This is idempotent - running multiple times won't cause issues
  const result = await client.query(
    `UPDATE auctions 
     SET state = 3,
         winner_address = $2,
         winner_fid = $3,
         winning_bid = $4
     WHERE cast_hash = $1
     RETURNING id, state, winner_address, winner_fid, winning_bid`,
    [
      formatCastHash(data.castHash),
      data.winner,
      data.winnerFid,
      data.amount
    ]
  );
  
  if (result.rows.length > 0) {
    console.log(`Updated auction ${data.castHash} to settled state. Winner: ${data.winner} (FID: ${data.winnerFid}), Amount: ${data.amount}`);
    return true;
  } else {
    console.log(`Auction not found for settled event: ${data.castHash}`);
    return false;
  }
}

async function backfillAuctionSettledEvents() {
  console.log('Starting AuctionSettled events backfill...');
  
  const dbClient = await getDbClient({
    DATABASE_URL: process.env.DATABASE_URL
  });
  
  const viemClient = createViemClient(process.env.BASE_RPC_URL);
  
  try {
    // Get the earliest and latest blocks to scan
    // You might want to adjust the start block based on when the contract was deployed
    const startBlockResult = await dbClient.query(
      'SELECT MIN(block_number) as min_block FROM auctions WHERE block_number > 0'
    );
    
    const startBlock = startBlockResult.rows[0]?.min_block ? BigInt(startBlockResult.rows[0].min_block) : 0n;
    const currentBlock = await viemClient.getBlockNumber();
    
    console.log(`Scanning from block ${startBlock} to ${currentBlock}`);
    
    let fromBlock = startBlock;
    let totalEvents = 0;
    let updatedAuctions = 0;
    
    while (fromBlock <= currentBlock) {
      const toBlock = fromBlock + BATCH_SIZE - 1n > currentBlock ? currentBlock : fromBlock + BATCH_SIZE - 1n;
      
      console.log(`Fetching AuctionSettled events from block ${fromBlock} to ${toBlock}...`);
      
      try {
        const logs = await viemClient.getLogs({
          address: CONTRACT_ADDRESS,
          events: [AUCTION_SETTLED_ABI],
          fromBlock,
          toBlock,
        });
        
        console.log(`Found ${logs.length} AuctionSettled events`);
        
        for (const log of logs) {
          try {
            const decoded = decodeEventLog({
              abi: [AUCTION_SETTLED_ABI],
              data: log.data,
              topics: log.topics,
            });
            
            const event = {
              ...decoded,
              blockNumber: log.blockNumber,
              transactionHash: log.transactionHash,
              logIndex: log.logIndex,
            };
            
            totalEvents++;
            const updated = await processAuctionSettledEvent(dbClient, event);
            if (updated) {
              updatedAuctions++;
            }
            
            if (totalEvents % 10 === 0) {
              console.log(`Processed ${totalEvents} events, updated ${updatedAuctions} auctions...`);
            }
          } catch (error) {
            console.error('Error processing event:', error);
          }
        }
        
        fromBlock = toBlock + 1n;
        
        // Small delay to avoid rate limits
        if (logs.length > 0) {
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
      } catch (error) {
        console.error(`Error processing blocks ${fromBlock} to ${toBlock}:`, error);
        // You might want to implement retry logic here
        break;
      }
    }
    
    // Get final statistics
    const statsResult = await dbClient.query(`
      SELECT 
        COUNT(*) FILTER (WHERE state = 1) as active_count,
        COUNT(*) FILTER (WHERE state = 2) as ended_count,
        COUNT(*) FILTER (WHERE state = 3) as settled_count,
        COUNT(*) FILTER (WHERE state = 4) as cancelled_count,
        COUNT(*) FILTER (WHERE state = 5) as recovered_count,
        COUNT(*) as total_count
      FROM auctions
    `);
    
    const stats = statsResult.rows[0];
    
    console.log('\n=== Backfill Complete ===');
    console.log(`Total AuctionSettled events found: ${totalEvents}`);
    console.log(`Auctions updated to settled state: ${updatedAuctions}`);
    console.log('\n=== Auction State Summary ===');
    console.log(`Active:    ${stats.active_count} (state = 1)`);
    console.log(`Ended:     ${stats.ended_count} (state = 2)`);
    console.log(`Settled:   ${stats.settled_count} (state = 3)`);
    console.log(`Cancelled: ${stats.cancelled_count} (state = 4)`);
    console.log(`Recovered: ${stats.recovered_count} (state = 5)`);
    console.log(`Total:     ${stats.total_count}`);
    
  } catch (error) {
    console.error('Backfill error:', error);
  } finally {
    await dbClient.end();
  }
}

// Run the backfill
backfillAuctionSettledEvents().catch(console.error);