import { createPublicClient, http, parseAbiItem, decodeEventLog } from 'viem';
import { base } from 'viem/chains';

export const CONTRACT_ADDRESS = '0xFC52e33F48Dd3fcd5EE428c160722efda645D74A';

// ABI for the events we're interested in
export const AUCTION_STARTED_ABI = parseAbiItem(
  'event AuctionStarted(bytes32 indexed castHash, address indexed creator, uint96 indexed creatorFid, uint40 endTime, address authorizer)'
);

export const BID_PLACED_ABI = parseAbiItem(
  'event BidPlaced(bytes32 indexed castHash, address indexed bidder, uint96 indexed bidderFid, uint256 amount, address authorizer)'
);

// Additional events we might want to track
export const AUCTION_EXTENDED_ABI = parseAbiItem(
  'event AuctionExtended(bytes32 indexed castHash, uint256 newEndTime)'
);

export const AUCTION_SETTLED_ABI = parseAbiItem(
  'event AuctionSettled(bytes32 indexed castHash, address indexed winner, uint96 indexed winnerFid, uint256 amount)'
);

export const AUCTION_CANCELLED_ABI = parseAbiItem(
  'event AuctionCancelled(bytes32 indexed castHash, address indexed refundedBidder, uint96 indexed refundedBidderFid, address authorizer)'
);

// Partial ABI for reading auction data - manually define the structure
export const AUCTION_ABI = [{
  name: 'auctions',
  type: 'function',
  stateMutability: 'view',
  inputs: [{ name: 'castHash', type: 'bytes32' }],
  outputs: [
    { name: 'creator', type: 'address' },
    { name: 'creatorFid', type: 'uint96' },
    { name: 'highestBidder', type: 'address' },
    { name: 'highestBidderFid', type: 'uint96' },
    { name: 'highestBid', type: 'uint256' },
    { name: 'lastBidAt', type: 'uint40' },
    { name: 'endTime', type: 'uint40' },
    { name: 'bids', type: 'uint32' },
    { name: 'state', type: 'uint8' },
    { 
      name: 'params', 
      type: 'tuple',
      components: [
        { name: 'minBid', type: 'uint64' },
        { name: 'minBidIncrementBps', type: 'uint16' },
        { name: 'protocolFeeBps', type: 'uint16' },
        { name: 'duration', type: 'uint32' },
        { name: 'extension', type: 'uint32' },
        { name: 'extensionThreshold', type: 'uint32' }
      ]
    }
  ]
}];

export function createViemClient(rpcUrl) {
  return createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });
}

export async function getContractEvents(client, fromBlock, toBlock) {
  const logs = await client.getLogs({
    address: CONTRACT_ADDRESS,
    events: [AUCTION_STARTED_ABI, BID_PLACED_ABI],
    fromBlock,
    toBlock,
  });

  return logs.map(log => {
    try {
      const decoded = decodeEventLog({
        abi: [AUCTION_STARTED_ABI, BID_PLACED_ABI],
        data: log.data,
        topics: log.topics,
      });

      return {
        ...decoded,
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
      };
    } catch (error) {
      console.error('Error decoding log:', error);
      return null;
    }
  }).filter(Boolean);
}

export async function getAuctionData(client, castHash) {
  try {
    const data = await client.readContract({
      address: CONTRACT_ADDRESS,
      abi: AUCTION_ABI,
      functionName: 'auctions',
      args: [castHash],
    });

    return {
      creator: data[0],
      creatorFid: Number(data[1]),
      highestBidder: data[2],
      highestBidderFid: Number(data[3]),
      highestBid: data[4].toString(),
      lastBidAt: Number(data[5]),
      endTime: Number(data[6]),
      bids: Number(data[7]),
      state: Number(data[8]),
      params: {
        minBid: data[9].minBid.toString(),
        minBidIncrementBps: Number(data[9].minBidIncrementBps),
        protocolFeeBps: Number(data[9].protocolFeeBps),
        duration: Number(data[9].duration),
        extension: Number(data[9].extension),
        extensionThreshold: Number(data[9].extensionThreshold),
      }
    };
  } catch (error) {
    console.error('Error reading auction data:', error);
    return null;
  }
}

export function parseAuctionStartedEvent(event) {
  return {
    castHash: event.args.castHash,
    creator: event.args.creator,
    creatorFid: Number(event.args.creatorFid),
    endTime: Number(event.args.endTime),
    authorizer: event.args.authorizer,
    blockNumber: event.blockNumber,
    transactionHash: event.transactionHash,
  };
}

export function parseBidPlacedEvent(event) {
  return {
    castHash: event.args.castHash,
    bidder: event.args.bidder,
    bidderFid: Number(event.args.bidderFid),
    amount: event.args.amount.toString(),
    authorizer: event.args.authorizer,
    blockNumber: event.blockNumber,
    transactionHash: event.transactionHash,
  };
}