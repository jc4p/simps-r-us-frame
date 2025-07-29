import dotenv from 'dotenv';
import { createViemClient, getNFTTransferEvents, parseTransferEvent, NFT_CONTRACT_ADDRESS } from '../src/contract.js';
import { getDbClient } from '../src/db.js';

// Load environment variables
dotenv.config({ path: '.dev.vars' });

const BATCH_SIZE = 500n;
const DELAY_MS = 100; // Delay between batches to avoid rate limits

async function getLastNFTSyncedBlock(client) {
  const result = await client.query('SELECT last_block_number FROM nft_sync_status WHERE id = 1');
  return BigInt(result.rows[0]?.last_block_number || 0);
}

async function updateLastNFTSyncedBlock(client, blockNumber) {
  await client.query(
    'UPDATE nft_sync_status SET last_block_number = $1, last_sync_time = CURRENT_TIMESTAMP WHERE id = 1',
    [blockNumber.toString()]
  );
}

async function processTransferEvent(client, viemClient, event) {
  const data = parseTransferEvent(event);
  
  // Get block timestamp
  const block = await viemClient.getBlock({ blockNumber: event.blockNumber });
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
  await client.query(
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

async function backfillNFTEvents() {
  console.log('Starting NFT Transfer events backfill...');
  
  const dbClient = await getDbClient({
    DATABASE_URL: process.env.DATABASE_URL
  });
  
  const viemClient = createViemClient(process.env.BASE_RPC_URL);
  
  try {
    // Get the last synced block for NFT contract
    const lastSyncedBlock = await getLastNFTSyncedBlock(dbClient);
    console.log(`Starting from block: ${lastSyncedBlock}`);
    
    // Get current block
    const currentBlock = await viemClient.getBlockNumber();
    console.log(`Current block: ${currentBlock}`);
    
    // Start from block 33200645 where the NFT contract was deployed
    const NFT_CONTRACT_START_BLOCK = 33200645n;
    let fromBlock = lastSyncedBlock > 0n ? lastSyncedBlock + 1n : NFT_CONTRACT_START_BLOCK;
    let totalEvents = 0;
    
    while (fromBlock <= currentBlock) {
      const toBlock = fromBlock + BATCH_SIZE - 1n > currentBlock ? currentBlock : fromBlock + BATCH_SIZE - 1n;
      
      console.log(`Fetching events from block ${fromBlock} to ${toBlock}...`);
      
      try {
        const events = await getNFTTransferEvents(viemClient, fromBlock, toBlock);
        // console.log(`Found ${events.length} transfer events`);
        
        for (const event of events) {
          if (event.eventName === 'Transfer') {
            await processTransferEvent(dbClient, viemClient, event);
            totalEvents++;
          }
        }
        
        // Update sync status
        await updateLastNFTSyncedBlock(dbClient, toBlock);
        
        fromBlock = toBlock + 1n;
        
        // Small delay to avoid rate limits
        if (events.length > 0) {
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
      } catch (error) {
        console.error(`Error processing blocks ${fromBlock} to ${toBlock}:`, error);
        // You might want to implement retry logic here
        break;
      }
    }
    
    console.log(`Backfill completed! Processed ${totalEvents} transfer events.`);
  } catch (error) {
    console.error('Backfill error:', error);
  } finally {
    await dbClient.end();
  }
}

// Run the backfill
backfillNFTEvents().catch(console.error);