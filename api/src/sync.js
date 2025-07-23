import { createViemClient, getContractEvents, parseAuctionStartedEvent, parseBidPlacedEvent, getAuctionData } from './contract.js';
import { executeQuery, getLastSyncedBlock, updateLastSyncedBlock } from './db.js';
import { formatCastHash } from './utils.js';

export async function syncEvents(env) {
  const client = createViemClient(env.BASE_RPC_URL);
  
  // Get the last synced block
  const lastSyncedBlock = await getLastSyncedBlock(env);
  const currentBlock = await client.getBlockNumber();
  
  // Don't sync if we're already up to date
  if (lastSyncedBlock >= currentBlock) {
    return { eventsProcessed: 0, lastBlock: currentBlock };
  }
  
  // Sync in batches to avoid rate limits
  const batchSize = 1000n;
  let fromBlock = lastSyncedBlock + 1n;
  let eventsProcessed = 0;
  
  while (fromBlock <= currentBlock) {
    const toBlock = fromBlock + batchSize - 1n > currentBlock ? currentBlock : fromBlock + batchSize - 1n;
    
    console.log(`Syncing blocks ${fromBlock} to ${toBlock}`);
    
    const events = await getContractEvents(client, fromBlock, toBlock);
    
    for (const event of events) {
      if (event.eventName === 'AuctionStarted') {
        await processAuctionStartedEvent(env, client, event);
        eventsProcessed++;
      } else if (event.eventName === 'BidPlaced') {
        await processBidPlacedEvent(env, event);
        eventsProcessed++;
      }
    }
    
    // Update last synced block after each batch
    await updateLastSyncedBlock(env, toBlock);
    
    fromBlock = toBlock + 1n;
  }
  
  return { eventsProcessed, lastBlock: currentBlock };
}

async function processAuctionStartedEvent(env, client, event) {
  const data = parseAuctionStartedEvent(event);
  
  // Get block timestamp
  const block = await client.getBlock({ blockNumber: event.blockNumber });
  const timestamp = new Date(Number(block.timestamp) * 1000);
  
  // Get additional auction data from contract
  const auctionData = await getAuctionData(client, data.castHash);
  
  if (!auctionData) {
    console.error(`Could not read auction data for ${data.castHash}`);
    return;
  }
  
  // Calculate end time from the event data
  const endTime = new Date(data.endTime * 1000);
  
  await executeQuery(
    env,
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

async function processBidPlacedEvent(env, event) {
  const data = parseBidPlacedEvent(event);
  
  // Get block timestamp
  const client = createViemClient(env.BASE_RPC_URL);
  const block = await client.getBlock({ blockNumber: event.blockNumber });
  const timestamp = new Date(Number(block.timestamp) * 1000);
  
  // Find the auction ID
  const auctionResult = await executeQuery(
    env,
    'SELECT id FROM auctions WHERE cast_hash = $1',
    [formatCastHash(data.castHash)]
  );
  
  if (auctionResult.rows.length === 0) {
    console.error(`Auction not found for bid on cast hash: ${data.castHash}`);
    return;
  }
  
  const auctionId = auctionResult.rows[0].id;
  
  await executeQuery(
    env,
    `INSERT INTO bids (
      auction_id, cast_hash, bidder_address, bidder_fid, 
      amount, transaction_hash, block_number, authorizer, timestamp
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
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