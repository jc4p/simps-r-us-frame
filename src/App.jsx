import { useState, useEffect } from 'react'
import { sdk } from '@farcaster/miniapp-sdk'
import { api } from './api'
import { 
  formatUSDC, 
  getSimpLevel, 
  formatBigNumber, 
  getBidHeadline,
  formatTimeAgo,
  getAuctionStatus,
  getBattleResult,
  formatPercentage,
  parseFid
} from './utils'
import './App.css'

function App() {
  // State management
  const [activeView, setActiveView] = useState('top-simps')
  const [selectedTimeframe, setSelectedTimeframe] = useState('all-time')
  const [loading, setLoading] = useState({})
  const [error, setError] = useState(null)
  const [battleError, setBattleError] = useState('')
  
  // Data states
  const [frameContext, setFrameContext] = useState(null)
  const [globalStats, setGlobalStats] = useState(null)
  const [topSimps, setTopSimps] = useState([])
  const [hotUsers, setHotUsers] = useState([])
  const [trending, setTrending] = useState(null)
  const [battleData, setBattleData] = useState(null)
  const [userLevel, setUserLevel] = useState(null)
  const [battleInputs, setBattleInputs] = useState({ fid1: '', fid2: '' })
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedUserProfile, setSelectedUserProfile] = useState(null)

  // Initialize Farcaster SDK
  useEffect(() => {
    const initializeFrame = async () => {
      try {
        // Get frame context
        const context = await sdk.context
        setFrameContext(context)
        
        // Mark frame as ready
        sdk.actions.ready()
      } catch (err) {
        console.error('Frame initialization error:', err)
        // Continue anyway for development
      }
    }
    
    initializeFrame()
  }, [])

  // Load initial data
  useEffect(() => {
    loadGlobalStats()
    loadTopSimps()
  }, [])

  // Load data based on active view
  useEffect(() => {
    switch (activeView) {
      case 'top-simps':
        loadTopSimps()
        break
      case 'hot-casts':
        loadHotUsers()
        break
      case 'trending':
        loadTrending()
        break
      case 'my-level':
        if (frameContext?.user?.fid) {
          loadUserLevel(frameContext.user.fid)
        }
        break
    }
  }, [activeView, selectedTimeframe])

  // Data loading functions
  const loadGlobalStats = async () => {
    try {
      setLoading(prev => ({ ...prev, stats: true }))
      const data = await api.getStats()
      setGlobalStats(data)
    } catch (err) {
      console.error('Failed to load stats:', err)
    } finally {
      setLoading(prev => ({ ...prev, stats: false }))
    }
  }

  const loadTopSimps = async () => {
    try {
      setLoading(prev => ({ ...prev, topSimps: true }))
      const data = selectedTimeframe === 'all-time' 
        ? await api.getTopSimps(50)
        : await api.getTopSimpsByTimeframe(selectedTimeframe, 50)
      setTopSimps(data.topBidders || [])
    } catch (err) {
      console.error('Failed to load top simps:', err)
      setError('Failed to load the hall of shame!')
    } finally {
      setLoading(prev => ({ ...prev, topSimps: false }))
    }
  }

  const loadHotUsers = async () => {
    try {
      setLoading(prev => ({ ...prev, hotUsers: true }))
      const data = await api.getHotUsers(20)
      setHotUsers(data.hotUsers || [])
    } catch (err) {
      console.error('Failed to load hot users:', err)
    } finally {
      setLoading(prev => ({ ...prev, hotUsers: false }))
    }
  }

  const loadTrending = async () => {
    try {
      setLoading(prev => ({ ...prev, trending: true }))
      const data = await api.getTrending()
      setTrending(data)
    } catch (err) {
      console.error('Failed to load trending:', err)
    } finally {
      setLoading(prev => ({ ...prev, trending: false }))
    }
  }

  const loadUserLevel = async (fid) => {
    try {
      setLoading(prev => ({ ...prev, userLevel: true }))
      const data = await api.getSimpLevel(fid)
      setUserLevel(data)
    } catch (err) {
      console.error('Failed to load user level:', err)
    } finally {
      setLoading(prev => ({ ...prev, userLevel: false }))
    }
  }

  const loadBattle = async () => {
    setBattleError('')
    
    const input1 = battleInputs.fid1.trim()
    const input2 = battleInputs.fid2.trim()
    
    if (!input1 || !input2) {
      setBattleError('Enter valid FIDs or usernames')
      return
    }

    try {
      setLoading(prev => ({ ...prev, battle: true }))
      
      // API now handles username resolution
      let params = {}
      
      // Check if input is a number (FID) or username
      if (!isNaN(parseInt(input1))) {
        params.fid1 = input1
      } else {
        params.user1 = input1.replace('@', '') // Remove @ if present
      }
      
      if (!isNaN(parseInt(input2))) {
        params.fid2 = input2
      } else {
        params.user2 = input2.replace('@', '') // Remove @ if present
      }
      
      const queryString = new URLSearchParams(params).toString()
      const response = await fetch(`${api.baseUrl}/analytics/simp-battles?${queryString}`)
      
      if (!response.ok) {
        const error = await response.json()
        setBattleError(error.error || 'Failed to load battle data')
        return
      }
      
      const data = await response.json()
      setBattleData(data)
      
      // Scroll to results after data loads
      setTimeout(() => {
        const resultsElement = document.querySelector('.battle-results')
        if (resultsElement) {
          resultsElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 100)
    } catch (err) {
      console.error('Failed to load battle:', err)
      setBattleError('Failed to load battle data')
    } finally {
      setLoading(prev => ({ ...prev, battle: false }))
    }
  }

  // View user profile details
  const viewProfile = async (fid) => {
    try {
      // Show modal immediately with loading state
      setSelectedUserProfile({ loading: true })
      setLoading(prev => ({ ...prev, profile: true }))
      const hallOfShameData = await api.getHallOfShameProfile(fid)
      setSelectedUserProfile(hallOfShameData)
    } catch (err) {
      console.error('Failed to load profile:', err)
      setSelectedUserProfile(null) // Close modal on error
    } finally {
      setLoading(prev => ({ ...prev, profile: false }))
    }
  }

  // Close profile modal
  const closeProfile = () => {
    setSelectedUserProfile(null)
  }

  // View cast in Farcaster
  const viewCast = async (castHash) => {
    try {
      await sdk.actions.viewCast({ 
        hash: castHash
      })
    } catch (err) {
      console.error('Failed to view cast:', err)
    }
  }

  // Render functions for different views
  const renderTopSimps = () => (
    <div className="top-simps-view">
      <div className="section-header">
        <h2 className="tabloid-headline">
          {selectedTimeframe === 'all-time' ? 'HALL OF SHAME' : `${selectedTimeframe.toUpperCase()}'S HOTTEST SIMPS`}
        </h2>
        <p className="scandal-subtitle">EXPOSED: The Biggest Simps in Farcaster!</p>
      </div>


      {loading.topSimps ? (
        <div className="loading">GATHERING THE GOSSIP...</div>
      ) : (
        <div className="simps-list">
          {topSimps.map((simp, index) => {
            const level = getSimpLevel(parseInt(simp.total_bids))
            const isCurrentUser = frameContext?.user?.fid === simp.bidder_fid
            
            return (
              <div 
                key={simp.bidder_fid} 
                className={`simp-card ${isCurrentUser ? 'current-user' : ''} ${index < 3 ? 'top-three' : ''}`}
                onClick={() => viewProfile(simp.bidder_fid)}
              >
                <div className="simp-card-main">
                  <div className="rank-badge">
                    {index === 0 && <span className="crown">👑</span>}
                    <span className="rank-number">#{index + 1}</span>
                  </div>
                  
                  <img 
                    src={simp.profile?.pfpUrl || '/default-avatar.png'} 
                    alt={simp.profile?.username || 'Simp'} 
                    className="simp-avatar"
                  />
                  
                  <div className="simp-info">
                    <h3 className="simp-name">
                      {simp.profile?.displayName || 'Anonymous Simp'}
                      {isCurrentUser && <span className="you-tag">YOU!</span>}
                    </h3>
                    
                    <div className="scandal-stats">
                      <span className="stat-item">
                        <span className="stat-label">CAUGHT</span>
                        <span className="stat-value">{simp.total_bids} TIMES</span>
                      </span>
                      <span className="stat-item">
                        <span className="stat-label">SPENT</span>
                        <span className="stat-value">{formatUSDC(simp.total_volume_cents)}</span>
                      </span>
                    </div>
                  </div>
                  
                  <div className="simp-level" style={{ color: level.color }}>
                    <span className="level-emoji">{level.emoji}</span>
                    <span className="level-text">{index === 0 ? 'SIMP IN CHARGE' : level.level}</span>
                  </div>
                </div>

                {simp.top_creators && simp.top_creators.length > 0 && (
                  <div className="favorite-creators">
                    <h4 className="creators-label">SIMPS FOR:</h4>
                    <div className="creators-list">
                      {simp.top_creators.slice(0, 3).map((creator, idx) => (
                        <div key={creator.creator_fid} className="creator-item">
                          <img 
                            src={creator.profile?.pfpUrl || '/default-avatar.png'} 
                            alt={creator.profile?.username || 'Creator'}
                            className="creator-avatar-tiny"
                            title={`@${creator.profile?.username || `fid:${creator.creator_fid}`} - ${creator.auctions_bid_on} auctions`}
                          />
                          <span className="creator-username">@{creator.profile?.username || `fid:${creator.creator_fid}`}</span>
                        </div>
                      ))}
                      {simp.top_creators.length > 3 && (
                        <span className="more-creators">+{simp.top_creators.length - 3} more</span>
                      )}
                    </div>
                  </div>
                )}

                {index === 0 && (
                  <div className="exclusive-badge">EXCLUSIVE!</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  const renderHotCasts = () => (
    <div className="hot-users-view">
      <div className="section-header">
        <h2 className="tabloid-headline">MONEY MAGNETS!</h2>
        <p className="scandal-subtitle">The Creators Making BANK From Simps!</p>
      </div>

      {loading.hotUsers ? (
        <div className="loading">COUNTING THE CASH...</div>
      ) : (
        <div className="hot-users-grid">
          {hotUsers.map((user, index) => {
            return (
              <div key={user.creator_fid} className="hot-user-card">
                <div className="rank-number">#{index + 1}</div>
                
                <div className="user-header">
                  <img 
                    src={user.profile?.pfpUrl || '/default-avatar.png'}
                    alt={user.profile?.username || 'Creator'}
                    className="creator-avatar"
                  />
                  <div className="creator-info">
                    <h4>{user.profile?.displayName || 'Mystery Creator'}</h4>
                  </div>
                </div>

                <div className="revenue-stats">
                  <div className="main-stat">
                    <span className="stat-label">TOTAL EARNED</span>
                    <span className="revenue-amount">{formatUSDC(user.stats?.total_revenue_cents || 0)}</span>
                  </div>
                  
                  <div className="stats-grid">
                    <div className="stat-item">
                      <span className="stat-value">{user.stats?.total_auctions || 0}</span>
                      <span className="stat-label">AUCTIONS</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-value">{user.stats?.unique_simps || 0}</span>
                      <span className="stat-label">SIMPS</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-value">{user.stats?.total_bids_received || 0}</span>
                      <span className="stat-label">TOTAL BIDS</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  const renderBattles = () => (
    <div className="battles-view">
      <div className="section-header">
        <h2 className="tabloid-headline">SIMP SHOWDOWN!</h2>
        <p className="scandal-subtitle">Who's the BIGGER Simp?!</p>
      </div>

      <div className="battle-inputs">
        <input
          type="text"
          placeholder="FID or @username"
          value={battleInputs.fid1}
          onChange={(e) => setBattleInputs(prev => ({ ...prev, fid1: e.target.value }))}
          className="battle-input"
        />
        
        <div className="vs-divider">VS</div>
        
        <input
          type="text"
          placeholder="FID or @username"
          value={battleInputs.fid2}
          onChange={(e) => setBattleInputs(prev => ({ ...prev, fid2: e.target.value }))}
          className="battle-input"
        />
        
        <button onClick={loadBattle} className="battle-btn" disabled={loading.battle}>
          {loading.battle ? 'CALCULATING...' : 'FIGHT!'}
        </button>
      </div>

      {battleError && (
        <div className="battle-error">
          {battleError}
        </div>
      )}

      {battleData && (
        <div className="battle-results">
          <div className="battle-headline">THE VERDICT IS IN!</div>
          
          <div className="battle-winner-section">
            <div className="winner-crown">👑</div>
            <div className="battle-result">
              {getBattleResult(battleData.user1.stats, battleData.user2.stats)}
            </div>
          </div>
          
          <div className="fighters-avatars">
            <img 
              src={battleData.user1.profile?.pfpUrl || '/default-avatar.png'}
              alt={battleData.user1.profile?.username || 'Fighter 1'}
              className={`fighter-avatar-vs ${battleData.winner.fid === battleData.user1.fid ? 'winner' : 'loser'}`}
            />
            <div className="vs-separator">VS</div>
            <img 
              src={battleData.user2.profile?.pfpUrl || '/default-avatar.png'}
              alt={battleData.user2.profile?.username || 'Fighter 2'}
              className={`fighter-avatar-vs ${battleData.winner.fid === battleData.user2.fid ? 'winner' : 'loser'}`}
            />
          </div>
          
          <div className="fighters-details">
            <div className={`fighter-details ${battleData.winner.fid === battleData.user1.fid ? 'winner' : 'loser'}`}>
              <h4>{battleData.user1.profile?.displayName || 'Fighter 1'}</h4>
              <div className="fighter-stats-block">
                <span>{battleData.user1.stats.total_bids} bids</span>
                <span>{formatUSDC(battleData.user1.stats.total_volume_cents)} spent</span>
              </div>
            </div>
            
            <div className={`fighter-details ${battleData.winner.fid === battleData.user2.fid ? 'winner' : 'loser'}`}>
              <h4>{battleData.user2.profile?.displayName || 'Fighter 2'}</h4>
              <div className="fighter-stats-block">
                <span>{battleData.user2.stats.total_bids} bids</span>
                <span>{formatUSDC(battleData.user2.stats.total_volume_cents)} spent</span>
              </div>
            </div>
          </div>

          {battleData.commonAuctions.total > 0 && (
            <div className="common-auctions">
              <h4>CAUGHT SIMPING TOGETHER {battleData.commonAuctions.total} TIMES!</h4>
              
              {battleData.commonAuctions.auctions && battleData.commonAuctions.auctions.length > 0 && (
                <div className="common-auctions-list">
                  {battleData.commonAuctions.auctions.slice(0, 3).map((auction) => (
                    <div key={auction.cast_hash} className="common-auction-item">
                      <div className="auction-bids-comparison">
                        <span className="user1-bid">{battleData.user1.profile?.username}: {formatUSDC(auction.user1_highest_bid_cents)}</span>
                        <span className="vs-small">vs</span>
                        <span className="user2-bid">{battleData.user2.profile?.username}: {formatUSDC(auction.user2_highest_bid_cents)}</span>
                      </div>
                      
                      {auction.creatorProfile && (
                        <div className="auction-creator-info">
                          <img 
                            src={auction.creatorProfile.pfpUrl || '/default-avatar.png'} 
                            alt={auction.creatorProfile.username}
                            className="creator-avatar-mini"
                          />
                          <span>@{auction.creatorProfile.username}</span>
                        </div>
                      )}
                      
                      {auction.castData && (
                        <div className="auction-cast-preview">
                          <p className="cast-text-preview">{auction.castData.text}</p>
                          <button 
                            className="view-cast-btn-mini"
                            onClick={() => viewCast(auction.castHash || auction.cast_hash)}
                          >
                            VIEW →
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )

  const renderTrending = () => (
    <div className="trending-view">
      <div className="section-header">
        <h2 className="tabloid-headline">HOT OFF THE PRESS!</h2>
        <p className="scandal-subtitle">Rising Stars & Hottest Auctions</p>
      </div>

      {loading.trending ? (
        <div className="loading">TRACKING THE TRENDS...</div>
      ) : trending && (
        <>
          <div className="rising-simps">
            <h3 className="sub-headline">WATCH OUT FOR THESE RISING SIMPS!</h3>
            <div className="rising-list">
              {trending.risingSimps?.map((simp, index) => (
                <div key={simp.bidder_fid} className="rising-simp">
                  <div className="rising-rank">#{index + 1}</div>
                  <img 
                    src={simp.profile?.pfpUrl || '/default-avatar.png'}
                    alt={simp.profile?.username || 'Rising Simp'}
                    className="rising-avatar"
                  />
                  <div className="rising-info">
                    <h4>{simp.profile?.displayName || 'Mystery Simp'}</h4>
                    <p>@{simp.profile?.username || `fid:${simp.bidder_fid}`}</p>
                  </div>
                  <div className="growth-badge">
                    {formatPercentage(parseFloat(simp.growth_percentage))} INCREASE!
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="hot-auctions">
            <h3 className="sub-headline">AUCTIONS CAUSING DRAMA!</h3>
            <div className="hot-auction-list">
              {trending.hotAuctions?.map((auction, index) => (
                <div key={auction.castHash || auction.cast_hash} className="hot-auction">
                  <div className="auction-heat">🔥 {auction.recent_bid_count} recent bids!</div>
                  <div className="auction-amount">{formatUSDC(auction.highest_recent_bid)}</div>
                  <div className="auction-bidders">{auction.unique_recent_bidders} simps involved</div>
                  
                  {auction.creatorProfile && (
                    <div className="auction-creator">
                      <img 
                        src={auction.creatorProfile.pfpUrl || '/default-avatar.png'} 
                        alt={auction.creatorProfile.username}
                        className="creator-avatar-mini"
                      />
                      <span>@{auction.creatorProfile.username}</span>
                    </div>
                  )}
                  
                  {auction.castData && (
                    <div className="auction-cast-preview">
                      <p className="cast-text-preview">{auction.castData.text}</p>
                      <button 
                        className="view-cast-btn-mini"
                        onClick={() => viewCast(auction.castHash || auction.cast_hash)}
                      >
                        VIEW →
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )

  const renderMyLevel = () => (
    <div className="my-level-view">
      <div className="section-header">
        <h2 className="tabloid-headline">YOUR SIMP REPORT CARD</h2>
        <p className="scandal-subtitle">The Truth Revealed!</p>
      </div>

      {!frameContext?.user ? (
        <div className="no-user">Connect your Farcaster account to see your scandal rating!</div>
      ) : loading.userLevel ? (
        <div className="loading">CALCULATING YOUR SCANDAL...</div>
      ) : userLevel && (
        <div className="level-report">
          <div className="user-header">
            <img 
              src={userLevel.profile?.pfpUrl || '/default-avatar.png'}
              alt={userLevel.profile?.username || 'You'}
              className="user-avatar"
            />
            <h3>{userLevel.profile?.displayName || 'Anonymous'}</h3>
            <p>@{userLevel.profile?.username || `fid:${userLevel.fid}`}</p>
          </div>

          <div className="level-display" style={{ backgroundColor: getSimpLevel(parseInt(userLevel.stats.total_bids)).color }}>
            <div className="level-emoji">{userLevel.emoji}</div>
            <div className="level-name">{userLevel.level}</div>
            <div className="percentile">{userLevel.percentile}</div>
          </div>

          <div className="user-stats">
            <div className="stat-card">
              <span className="stat-label">TOTAL BIDS</span>
              <span className="stat-value">{userLevel.stats.total_bids}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">TOTAL SPENT</span>
              <span className="stat-value">{formatUSDC(userLevel.stats.total_volume_cents)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">BID RANK</span>
              <span className="stat-value">#{userLevel.rank.bidRank} of {userLevel.rank.totalSimps}</span>
            </div>
          </div>

          {userLevel.achievements && userLevel.achievements.length > 0 && (
            <div className="achievements">
              <h4>YOUR AWARDS</h4>
              <div className="achievement-list">
                {userLevel.achievements.map((achievement, index) => (
                  <div key={index} className="achievement">
                    <span className="achievement-emoji">{achievement.emoji}</span>
                    <div className="achievement-info">
                      <h5>{achievement.name}</h5>
                      <p>{achievement.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {userLevel.nextMilestone && (
            <div className="next-milestone">
              <h4>NEXT SCANDAL LEVEL</h4>
              <p>{userLevel.nextMilestone.name}</p>
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${(userLevel.nextMilestone.current / userLevel.nextMilestone.requirement) * 100}%` }}
                />
              </div>
              <p className="progress-text">
                {userLevel.nextMilestone.current} / {userLevel.nextMilestone.requirement}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead-content">
          <h1 className="tabloid-title">SIMPS R US</h1>
          <p className="tagline">THE HOTTEST GOSSIP IN THE FARCASTER SOCIAL SCENE</p>
          
          <div className="breaking-stats">
            {globalStats && (
              <span className="breaking-text">
                SHOCKING: {formatBigNumber(globalStats.totalSimps)} SIMPS EXPOSED!
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="tabloid-content">
        <section className="headlines">
          {activeView === 'top-simps' && renderTopSimps()}
          {activeView === 'hot-casts' && renderHotCasts()}
          {activeView === 'battles' && renderBattles()}
          {activeView === 'trending' && renderTrending()}
          {activeView === 'my-level' && renderMyLevel()}
        </section>
      </main>

      <nav className="gossip-nav">
        <button 
          className={`nav-tab ${activeView === 'top-simps' ? 'active' : ''}`}
          onClick={() => setActiveView('top-simps')}
        >
          <span className="tab-label">HALL OF SHAME</span>
          <span className="tab-subtitle">Top Simps</span>
        </button>
        
        <button 
          className={`nav-tab ${activeView === 'hot-casts' ? 'active' : ''}`}
          onClick={() => setActiveView('hot-casts')}
        >
          <span className="tab-label">HOT GOSSIP</span>
          <span className="tab-subtitle">Trending Casts</span>
        </button>
        
        <button 
          className={`nav-tab ${activeView === 'battles' ? 'active' : ''}`}
          onClick={() => setActiveView('battles')}
        >
          <span className="tab-label">SIMP WARS</span>
          <span className="tab-subtitle">Battle Mode</span>
        </button>
        
        
        <button 
          className={`nav-tab ${activeView === 'my-level' ? 'active' : ''}`}
          onClick={() => setActiveView('my-level')}
        >
          <span className="tab-label">YOUR SCANDAL</span>
          <span className="tab-subtitle">My Level</span>
        </button>
      </nav>

      {/* Profile Modal */}
      {selectedUserProfile && (
        <div className="profile-modal-overlay" onClick={closeProfile}>
          <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={closeProfile}>✕</button>
            
            {(loading.profile || selectedUserProfile?.loading) ? (
              <div className="loading">LOADING SCANDAL...</div>
            ) : selectedUserProfile && !selectedUserProfile.loading && (
              <>
                <div className="profile-header">
                  <img 
                    src={selectedUserProfile.user?.profile?.pfpUrl || '/default-avatar.png'}
                    alt={selectedUserProfile.user?.profile?.username || 'User'}
                    className="profile-avatar"
                  />
                  <h2>{selectedUserProfile.user?.profile?.displayName || 'Anonymous'}</h2>
                  <p className="profile-username">@{selectedUserProfile.user?.profile?.username || `fid:${selectedUserProfile.user?.fid}`}</p>
                  {selectedUserProfile.user?.profile?.bio && (
                    <p className="profile-bio">{selectedUserProfile.user.profile.bio}</p>
                  )}
                </div>

                <div className="profile-stats-grid">
                  <div className="stat-box">
                    <span className="stat-label">TOTAL BIDS</span>
                    <span className="stat-value">{selectedUserProfile.stats?.totalBids || 0}</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">TOTAL SPENT</span>
                    <span className="stat-value">{formatUSDC(selectedUserProfile.stats?.totalVolumeCents || 0)}</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">RANK</span>
                    <span className="stat-value">#{selectedUserProfile.stats?.bidRank || 'N/A'}</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">HIGHEST BID</span>
                    <span className="stat-value">{formatUSDC(selectedUserProfile.stats?.highestBidCents || 0)}</span>
                  </div>
                </div>

                {selectedUserProfile.user?.simpLevel && (
                  <div className="profile-level-section">
                    <h3>SIMP LEVEL</h3>
                    <div className="level-display-mini" style={{ backgroundColor: getSimpLevel(selectedUserProfile.user.simpLevel.totalBids).color }}>
                      <span className="level-emoji">{selectedUserProfile.user.simpLevel.emoji}</span>
                      <span className="level-name">
                        {selectedUserProfile.stats?.bidRank === 1 ? 'SIMP IN CHARGE' : selectedUserProfile.user.simpLevel.level}
                      </span>
                    </div>
                  </div>
                )}

                {selectedUserProfile.topCreators && selectedUserProfile.topCreators.length > 0 && (
                  <div className="profile-section">
                    <h3>THIRSTS FOR</h3>
                    <div className="top-creators-list">
                      {selectedUserProfile.topCreators.map((creator, idx) => (
                        <div key={creator.creatorFid} className="creator-stat-item">
                          <span className="creator-rank">#{idx + 1}</span>
                          <img 
                            src={creator.profile?.pfpUrl || '/default-avatar.png'} 
                            alt={creator.profile?.username || 'Creator'}
                            className="creator-avatar-small"
                          />
                          <div className="creator-info-compact">
                            <span className="creator-name">{creator.profile?.displayName || 'Anonymous'}</span>
                            <span className="creator-username">@{creator.profile?.username || `fid:${creator.creatorFid}`}</span>
                            <div className="creator-stats-row">
                              <span className="stat">{formatUSDC(creator.totalSpentCents)} spent</span>
                              <span className="stat-separator">•</span>
                              <span className="stat">{creator.auctionsBidOn} auctions</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedUserProfile.mostBidCasts && selectedUserProfile.mostBidCasts.length > 0 && (
                  <div className="profile-section">
                    <h3>CASTS THEY CAN'T STOP BIDDING ON</h3>
                    <div className="most-bid-casts-list">
                      {selectedUserProfile.mostBidCasts.map((cast, idx) => (
                        <div key={cast.castHash} className="most-bid-cast-item">
                          <div className="cast-bid-header">
                            <span className="bid-frequency">Bid {cast.userBidCount} times!</span>
                            <span className="max-bid">Max: {formatUSDC(cast.userHighestBidCents)}</span>
                          </div>
                          
                          <div className="cast-creator-row">
                            <img 
                              src={cast.creatorProfile?.pfpUrl || '/default-avatar.png'}
                              alt={cast.creatorProfile?.username || 'Creator'}
                              className="creator-avatar-tiny"
                            />
                            <span>@{cast.creatorProfile?.username || `fid:${cast.creatorFid}`}</span>
                            <span className="auction-status-badge">{getAuctionStatus(cast.state, cast.endTime).text}</span>
                          </div>
                          
                          {cast.castData && (
                            <div className="cast-preview-compact">
                              <p className="cast-text-preview">{cast.castData.text}</p>
                              {cast.castData.firstEmbed?.type === 'image' && (
                                <img 
                                  src={cast.castData.firstEmbed.url} 
                                  alt="Cast embed" 
                                  className="cast-embed-preview"
                                />
                              )}
                              <button 
                                className="view-cast-btn-mini"
                                onClick={() => viewCast(cast.castHash)}
                              >
                                VIEW →
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
