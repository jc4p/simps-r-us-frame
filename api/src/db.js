import { Client } from '@neondatabase/serverless';

export async function getDbClient(env) {
  const client = new Client({
    connectionString: env.DATABASE_URL,
  });
  
  await client.connect();
  return client;
}

export async function executeQuery(env, query, params = []) {
  const client = await getDbClient(env);
  try {
    const result = await client.query(query, params);
    return result;
  } finally {
    await client.end();
  }
}

export async function getLastSyncedBlock(env) {
  const result = await executeQuery(
    env,
    'SELECT last_block_number FROM sync_status WHERE id = 1'
  );
  console.log('getLastSyncedBlock query result:', result.rows);
  
  // PostgreSQL returns bigint as string, need to convert to BigInt
  const blockNumber = result.rows[0]?.last_block_number;
  if (blockNumber) {
    return BigInt(blockNumber);
  }
  return 0n;
}

export async function updateLastSyncedBlock(env, blockNumber) {
  await executeQuery(
    env,
    'UPDATE sync_status SET last_block_number = $1, last_sync_time = CURRENT_TIMESTAMP WHERE id = 1',
    [blockNumber.toString()]
  );
}

export async function getLastNFTSyncedBlock(env) {
  const result = await executeQuery(
    env,
    'SELECT last_block_number FROM nft_sync_status WHERE id = 1'
  );
  return BigInt(result.rows[0]?.last_block_number || 0);
}

export async function updateLastNFTSyncedBlock(env, blockNumber) {
  await executeQuery(
    env,
    'UPDATE nft_sync_status SET last_block_number = $1, last_sync_time = CURRENT_TIMESTAMP WHERE id = 1',
    [blockNumber.toString()]
  );
}