export class NeynarClient {
  constructor(apiKey, kvCache = null) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.neynar.com/v2';
    this.kvCache = kvCache;
    this.cacheTTL = 3600; // 1 hour cache
  }

  async getUsersByFids(fids) {
    if (!fids || fids.length === 0) return {};
    
    const allUsers = {};
    const uncachedFids = [];
    
    // Check cache first if available
    if (this.kvCache) {
      const cachePromises = fids.map(fid => 
        this.kvCache.get(`user:${fid}`, { type: 'json' })
      );
      const cachedResults = await Promise.all(cachePromises);
      
      fids.forEach((fid, index) => {
        if (cachedResults[index]) {
          allUsers[fid] = cachedResults[index];
        } else {
          uncachedFids.push(fid);
        }
      });
    } else {
      uncachedFids.push(...fids);
    }
    
    // Fetch uncached users
    if (uncachedFids.length > 0) {
      // Batch fetch users (Neynar supports up to 100 FIDs per request)
      const batchSize = 100;
      const batches = [];
      
      for (let i = 0; i < uncachedFids.length; i += batchSize) {
        batches.push(uncachedFids.slice(i, i + batchSize));
      }
      
      for (const batch of batches) {
        const response = await fetch(
          `${this.baseUrl}/farcaster/user/bulk/?fids=${batch.join(',')}`,
          {
            headers: {
              'x-api-key': this.apiKey,
              'x-neynar-experimental': 'false'
            }
          }
        );
        
        if (!response.ok) {
          console.error('Failed to fetch users from Neynar:', response.statusText);
          continue;
        }
        
        const data = await response.json();
        
        // Process and cache results
        const cachePromises = [];
        
        for (const user of data.users) {
          const userData = {
            fid: user.fid,
            username: user.username,
            displayName: user.display_name,
            pfpUrl: user.pfp_url,
            followerCount: user.follower_count,
            followingCount: user.following_count,
            bio: user.profile?.bio?.text,
            primaryAddress: user.verified_addresses?.eth_addresses?.[0] || null,
            powerBadge: user.power_badge || false
          };
          
          allUsers[user.fid] = userData;
          
          // Cache the result
          if (this.kvCache) {
            cachePromises.push(
              this.kvCache.put(`user:${user.fid}`, JSON.stringify(userData), {
                expirationTtl: this.cacheTTL
              })
            );
          }
        }
        
        // Wait for all cache writes to complete
        if (cachePromises.length > 0) {
          await Promise.all(cachePromises);
        }
      }
    }
    
    return allUsers;
  }

  async getUser(fid) {
    const users = await this.getUsersByFids([fid]);
    return users[fid] || null;
  }

  async getUserByUsername(username) {
    // Check cache first
    if (this.kvCache) {
      const cached = await this.kvCache.get(`username:${username}`, { type: 'json' });
      if (cached) {
        return cached;
      }
    }
    
    const response = await fetch(
      `${this.baseUrl}/farcaster/user/by_username/?username=${encodeURIComponent(username)}`,
      {
        headers: {
          'x-api-key': this.apiKey,
          'x-neynar-experimental': 'false'
        }
      }
    );
    
    if (!response.ok) {
      console.error('Failed to fetch user by username from Neynar:', response.statusText);
      return null;
    }
    
    const data = await response.json();
    const user = data.user;
    
    if (!user) return null;
    
    const userData = {
      fid: user.fid,
      username: user.username,
      displayName: user.display_name,
      pfpUrl: user.pfp_url,
      followerCount: user.follower_count,
      followingCount: user.following_count,
      bio: user.profile?.bio?.text,
      primaryAddress: user.verified_addresses?.eth_addresses?.[0] || null,
      powerBadge: user.power_badge || false
    };
    
    // Cache both by username and FID
    if (this.kvCache) {
      await Promise.all([
        this.kvCache.put(`username:${username}`, JSON.stringify(userData), {
          expirationTtl: this.cacheTTL
        }),
        this.kvCache.put(`user:${user.fid}`, JSON.stringify(userData), {
          expirationTtl: this.cacheTTL
        })
      ]);
    }
    
    return userData;
  }

  async getCastsByHashes(hashes) {
    if (!hashes || hashes.length === 0) return {};
    
    // Remove duplicates
    const uniqueHashes = [...new Set(hashes)];
    const allCasts = {};
    const uncachedHashes = [];
    
    // Check cache first if available
    if (this.kvCache) {
      const cachePromises = uniqueHashes.map(hash => 
        this.kvCache.get(`cast:${hash}`, { type: 'json' })
      );
      const cachedResults = await Promise.all(cachePromises);
      
      uniqueHashes.forEach((hash, index) => {
        if (cachedResults[index]) {
          allCasts[hash] = cachedResults[index];
        } else {
          uncachedHashes.push(hash);
        }
      });
    } else {
      uncachedHashes.push(...uniqueHashes);
    }
    
    // Fetch uncached casts
    if (uncachedHashes.length > 0) {
      // Batch fetch casts (Neynar supports up to 50 casts per request)
      const batchSize = 50;
      const batches = [];
      
      for (let i = 0; i < uncachedHashes.length; i += batchSize) {
        batches.push(uncachedHashes.slice(i, i + batchSize));
      }
      
      for (const batch of batches) {
        const response = await fetch(
          `${this.baseUrl}/farcaster/casts/?casts=${batch.join(',')}`,
          {
            headers: {
              'x-api-key': this.apiKey,
              'x-neynar-experimental': 'false'
            }
          }
        );
        
        if (!response.ok) {
          console.error('Failed to fetch casts from Neynar:', response.statusText);
          continue;
        }
        
        const data = await response.json();
        const cachePromises = [];
        
        for (const result of data.result.casts) {
          const cast = result.cast || result;
          
          // Process first embed - could be a URL, image, or cast
          let firstEmbed = null;
          if (cast.embeds && cast.embeds.length > 0) {
            const embed = cast.embeds[0];
            
            // Check if it's a cast embed (quote cast)
            if (embed.cast_id || embed.cast) {
              firstEmbed = {
                type: 'cast',
                cast_id: embed.cast_id,
                cast_hash: embed.cast_id?.hash || embed.cast?.hash,
                cast_text: embed.cast?.text || null,
                cast_author: embed.cast?.author?.username || null
              };
            } 
            // Check if it's a URL/image embed
            else if (embed.url) {
              firstEmbed = {
                type: embed.metadata?.content_type?.startsWith('image/') ? 'image' : 'url',
                url: embed.url,
                metadata: embed.metadata || null
              };
            }
            // Otherwise just pass through the raw embed
            else {
              firstEmbed = embed;
            }
          }
          
          const castData = {
            hash: cast.hash,
            text: cast.text || '',
            timestamp: cast.timestamp,
            firstEmbed: firstEmbed
          };
          
          allCasts[cast.hash] = castData;
          
          // Cache the result
          if (this.kvCache) {
            cachePromises.push(
              this.kvCache.put(`cast:${cast.hash}`, JSON.stringify(castData), {
                expirationTtl: this.cacheTTL
              })
            );
          }
        }
        
        // Wait for all cache writes to complete
        if (cachePromises.length > 0) {
          await Promise.all(cachePromises);
        }
      }
    }
    
    return allCasts;
  }

  async getCast(hash) {
    const casts = await this.getCastsByHashes([hash]);
    return casts[hash] || null;
  }
}