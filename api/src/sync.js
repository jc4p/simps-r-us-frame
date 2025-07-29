import { createViemClient, getContractEvents, parseAuctionStartedEvent, parseBidPlacedEvent, getAuctionData, getNFTTransferEvents, parseTransferEvent } from './contract.js';
import { executeQuery, getLastSyncedBlock, updateLastSyncedBlock, getLastNFTSyncedBlock, updateLastNFTSyncedBlock } from './db.js';
import { formatCastHash } from './utils.js';

export async function syncEvents(env) {
  const client = createViemClient(env.BASE_RPC_URL);
  
  // Sync both contracts in parallel
  const [auctionResult, transferResult] = await Promise.all([
    syncAuctionEvents(env, client),
    syncNFTEvents(env, client)
  ]);
  
  return {
    eventsProcessed: auctionResult.eventsProcessed + transferResult.eventsProcessed,
    auctionEventsProcessed: auctionResult.eventsProcessed,
    transferEventsProcessed: transferResult.eventsProcessed,
    lastBlock: auctionResult.lastBlock
  };
}

async function syncAuctionEvents(env, client) {
  // Get the last synced block
  const lastSyncedBlock = await getLastSyncedBlock(env);
  console.log(`Last synced block from DB: ${lastSyncedBlock}`);
  
  const currentBlock = await client.getBlockNumber();
  console.log(`Current blockchain block: ${currentBlock}`);
  
  // Don't sync if we're already up to date
  if (lastSyncedBlock >= currentBlock) {
    console.log('Already up to date, no sync needed');
    return { eventsProcessed: 0, lastBlock: currentBlock };
  }
  
  // Sync in batches to avoid rate limits
  const batchSize = 500n; // Reduced from 1000n to match backfill script
  let fromBlock = lastSyncedBlock + 1n;
  let eventsProcessed = 0;
  
  while (fromBlock <= currentBlock) {
    const toBlock = fromBlock + batchSize - 1n > currentBlock ? currentBlock : fromBlock + batchSize - 1n;
    
    console.log(`Syncing auction blocks ${fromBlock} to ${toBlock}`);
    
    const events = await getContractEvents(client, fromBlock, toBlock);
    console.log(`Found ${events.length} auction events in this batch`);
    
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

async function syncNFTEvents(env, client) {
  // Get the last synced block for NFT contract
  const lastSyncedBlock = await getLastNFTSyncedBlock(env);
  console.log(`Last NFT synced block from DB: ${lastSyncedBlock}`);

  return { eventsProcessed: 0, lastBlock: lastSyncedBlock };
  
  const currentBlock = await client.getBlockNumber();
  console.log(`Current blockchain block: ${currentBlock}`);
  
  // Don't sync if we're already up to date
  if (lastSyncedBlock >= currentBlock) {
    console.log('NFT sync already up to date, no sync needed');
    return { eventsProcessed: 0, lastBlock: currentBlock };
  }
  
  // Sync in batches to avoid rate limits
  const batchSize = 500n;
  let fromBlock = lastSyncedBlock + 1n;
  let eventsProcessed = 0;
  
  while (fromBlock <= currentBlock) {
    const toBlock = fromBlock + batchSize - 1n > currentBlock ? currentBlock : fromBlock + batchSize - 1n;
    
    console.log(`Syncing NFT blocks ${fromBlock} to ${toBlock}`);
    
    const events = await getNFTTransferEvents(client, fromBlock, toBlock);
    console.log(`Found ${events.length} transfer events in this batch`);
    
    for (const event of events) {
      if (event.eventName === 'Transfer') {
        await processTransferEvent(env, client, event);
        eventsProcessed++;
      }
    }
    
    // Update last synced block after each batch
    await updateLastNFTSyncedBlock(env, toBlock);
    
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

async function processAuctionSettledEvent(env, event) {
  const data = parseAuctionSettledEvent(event);
  
  // Update the auction state to settled (3) and store winner information
  await executeQuery(
    env,
    `UPDATE auctions 
     SET state = 3,
         winner_address = $2,
         winner_fid = $3,
         winning_bid = $4
     WHERE cast_hash = $1`,
    [
      formatCastHash(data.castHash),
      data.winner,
      data.winnerFid,
      data.amount
    ]
  );
  
  console.log(`Auction settled: ${data.castHash} - Winner: ${data.winner} (FID: ${data.winnerFid}) - Amount: ${data.amount}`);
}

async function processTransferEvent(env, client, event) {
  const data = parseTransferEvent(event);
  
  // Get block timestamp
  const block = await client.getBlock({ blockNumber: event.blockNumber });
  const timestamp = new Date(Number(block.timestamp) * 1000);
  
  // Only consider transfers as P2P if they meet ALL these criteria:
  // 1. NOT from the zero address (mints)
  // 2. NOT to the zero address (burns)
  // 3. NOT from the auction contract
  // 4. NOT to the auction contract
  
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  const AUCTION_CONTRACT = '0xFC52e33F48Dd3fcd5EE428c160722efda645D74A';
  
  let isP2P = true;
  
  // Exclude mints (from zero address)
  if (data.fromAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
    isP2P = false;
  }
  
  // Exclude burns (to zero address)
  if (data.toAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
    isP2P = false;
  }
  
  // Exclude transfers from auction contract
  if (data.fromAddress.toLowerCase() === AUCTION_CONTRACT.toLowerCase()) {
    isP2P = false;
  }
  
  // Exclude transfers to auction contract
  if (data.toAddress.toLowerCase() === AUCTION_CONTRACT.toLowerCase()) {
    isP2P = false;
  }
  
  // Only insert if it's a true P2P transfer
  if (!isP2P) {
    return; // Skip non-P2P transfers entirely
  }
  
  // Insert the P2P transfer record
  await executeQuery(
    env,
    `INSERT INTO transfers (
      from_address, to_address, token_id, 
      transaction_hash, block_number, timestamp, is_p2p
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (transaction_hash, token_id) DO NOTHING`,
    [
      data.fromAddress,
      data.toAddress,
      data.tokenId,
      data.transactionHash,
      data.blockNumber.toString(),
      timestamp,
      true // Always true since we're only inserting P2P transfers
    ]
  );
}