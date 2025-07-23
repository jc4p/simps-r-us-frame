#!/usr/bin/env node

import { config } from 'dotenv';
import { createViemClient, getContractEvents, parseAuctionStartedEvent, parseBidPlacedEvent, getAuctionData, CONTRACT_ADDRESS } from '../src/contract.js';
import { Client } from 'pg';
import { formatCastHash } from '../src/utils.js';

// Load environment variables
config({ path: '.dev.vars' });

const CONTRACT_DEPLOYMENT_BLOCK = 33200651n; // Starting block for sync

async function getDbClient() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await client.connect();
  return client;
}

async function processEvents(client, dbClient, fromBlock, toBlock) {
  console.log(`Processing blocks ${fromBlock} to ${toBlock}`);
  
  const events = await getContractEvents(client, fromBlock, toBlock);
  let startEvents = 0;
  let bidEvents = 0;
  
  for (const event of events) {
    if (event.eventName === 'AuctionStarted') {
      await processAuctionStartedEvent(dbClient, client, event);
      startEvents++;
    } else if (event.eventName === 'BidPlaced') {
      await processBidPlacedEvent(dbClient, client, event);
      bidEvents++;
    }
  }
  
  console.log(`Processed ${startEvents} start events and ${bidEvents} bid events`);
  return events.length;
}

async function processAuctionStartedEvent(dbClient, viemClient, event) {
  const data = parseAuctionStartedEvent(event);
  
  // Get block timestamp
  const block = await viemClient.getBlock({ blockNumber: event.blockNumber });
  const timestamp = new Date(Number(block.timestamp) * 1000);
  
  // Get additional auction data from contract
  const auctionData = await getAuctionData(viemClient, data.castHash);
  
  if (!auctionData) {
    console.error(`Could not read auction data for ${data.castHash}`);
    return;
  }
  
  // Calculate end time from the event data
  const endTime = new Date(data.endTime * 1000);
  
  await dbClient.query(
    `INSERT INTO auctions (
      cast_hash, creator_address, creator_fid, min_bid, 
      min_bid_increment_bps, protocol_fee_bps, duration, 
      extension, extension_threshold, end_time,
      transaction_hash, block_number, authorizer, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    ON CONFLICT (cast_hash) DO NOTHING`,
    [
      formatCastHash(data.castHash),
      data.creator,
      data.creatorFid,
      auctionData.params.minBid,
      auctionData.params.minBidIncrementBps,
      auctionData.params.protocolFeeBps,
      auctionData.params.duration,
      auctionData.params.extension,
      auctionData.params.extensionThreshold,
      endTime,
      data.transactionHash,
      data.blockNumber.toString(),
      data.authorizer,
      timestamp
    ]
  );
}

async function processBidPlacedEvent(dbClient, viemClient, event) {
  const data = parseBidPlacedEvent(event);
  
  // Get block timestamp
  const block = await viemClient.getBlock({ blockNumber: event.blockNumber });
  const timestamp = new Date(Number(block.timestamp) * 1000);
  
  // Find the auction ID
  const auctionResult = await dbClient.query(
    'SELECT id FROM auctions WHERE cast_hash = $1',
    [formatCastHash(data.castHash)]
  );
  
  if (auctionResult.rows.length === 0) {
    console.error(`Auction not found for bid on cast hash: ${data.castHash}`);
    return;
  }
  
  const auctionId = auctionResult.rows[0].id;
  
  await dbClient.query(
    `INSERT INTO bids (
      auction_id, cast_hash, bidder_address, bidder_fid, 
      amount, transaction_hash, block_number, authorizer, timestamp
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT DO NOTHING`, // Avoid duplicates
    [
      auctionId,
      formatCastHash(data.castHash),
      data.bidder,
      data.bidderFid,
      data.amount,
      data.transactionHash,
      data.blockNumber.toString(),
      data.authorizer,
      timestamp
    ]
  );
}

async function main() {
  console.log('Starting backfill process...');
  console.log(`Contract address: ${CONTRACT_ADDRESS}`);
  
  const viemClient = createViemClient(process.env.BASE_RPC_URL);
  const dbClient = await getDbClient();
  
  try {
    // Get current block
    const currentBlock = await viemClient.getBlockNumber();
    console.log(`Current block: ${currentBlock}`);
    
    // Process in batches
    const batchSize = 500n;
    let fromBlock = CONTRACT_DEPLOYMENT_BLOCK;
    let totalEvents = 0;
    
    while (fromBlock <= currentBlock) {
      const toBlock = fromBlock + batchSize - 1n > currentBlock ? currentBlock : fromBlock + batchSize - 1n;
      
      const eventsProcessed = await processEvents(viemClient, dbClient, fromBlock, toBlock);
      totalEvents += eventsProcessed;
      
      // Update sync status
      await dbClient.query(
        'UPDATE sync_status SET last_block_number = $1, last_sync_time = CURRENT_TIMESTAMP WHERE id = 1',
        [toBlock.toString()]
      );
      
      fromBlock = toBlock + 1n;
      
      // Small delay to avoid rate limits
      if (eventsProcessed > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`Backfill complete! Total events processed: ${totalEvents}`);
    
  } catch (error) {
    console.error('Backfill error:', error);
  } finally {
    await dbClient.end();
  }
}

// Run the backfill
main().catch(console.error);