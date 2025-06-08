'use client'

import React, { useState, useEffect, useRef } from 'react'
import { z } from 'zod'
import { createKSync } from '../lib/ksync-client'

// Schemas
const ChatMessageSchema = z.object({
  id: z.string(),
  username: z.string(),
  message: z.string(),
  timestamp: z.number(),
})

const PlayerJoinedSchema = z.object({
  username: z.string(),
  color: z.string(),
})

const PlayerMoveSchema = z.object({
  x: z.number(),
  y: z.number(),
})

const GameStateUpdateSchema = z.object({
  players: z.array(z.object({
    id: z.string(),
    username: z.string(),
    x: z.number(),
    y: z.number(),
    color: z.string(),
    score: z.number(),
    isAlive: z.boolean(),
  })),
  gameStarted: z.boolean(),
})

interface Player {
  id: string
  username: string
  x: number
  y: number
  color: string
  score: number
  isAlive: boolean
}

interface ChatMessage {
  id: string
  username: string
  message: string
  timestamp: number
}

export default function GamePage() {
  const [username, setUsername] = useState('')
  const [isJoined, setIsJoined] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [players, setPlayers] = useState<Player[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  
  const ksyncRef = useRef<any>(null)
  const gameCanvasRef = useRef<HTMLDivElement>(null)
  const lastMoveTimeRef = useRef<number>(0)

  // Initialize kSync
  useEffect(() => {
    // Prevent double initialization in React StrictMode
    if (ksyncRef.current) return

    const initKSync = async () => {
      try {
        console.log('🚀 Initializing kSync...')
        const ksync = createKSync({
          serverUrl: 'ws://localhost:8081',
          debug: true,
        })

        // Define schemas
        ksync.defineSchema('chat-message', ChatMessageSchema)
        ksync.defineSchema('player-joined', PlayerJoinedSchema)
        ksync.defineSchema('player-move', PlayerMoveSchema)
        ksync.defineSchema('game-state-update', GameStateUpdateSchema)

        // Set up event listeners
        ksync.on('chat-message', (event: any) => {
          console.log('📨 Chat message received:', event.data)
          setChatMessages(prev => {
            // Prevent duplicate messages
            if (prev.some(msg => msg.id === event.data.id)) {
              return prev
            }
            return [...prev, event.data]
          })
        })

        ksync.on('game-state-update', (event: any) => {
          console.log('🎮 Game state update:', event.data.players.length, 'players')
          setPlayers(event.data.players)
        })

        console.log('🔌 Connecting to server...')
        await ksync.initialize()
        ksyncRef.current = ksync
        setIsConnected(true)
        console.log('✅ kSync initialized successfully!')
      } catch (error) {
        console.error('❌ Failed to initialize kSync:', error)
        // Try to connect anyway for debugging
        setTimeout(() => {
          console.log('🔄 Retrying connection...')
          initKSync()
        }, 3000)
      }
    }

    initKSync()

    // Cleanup function
    return () => {
      if (ksyncRef.current) {
        console.log('🧹 Cleaning up kSync connection...')
        ksyncRef.current.close?.()
        ksyncRef.current = null
      }
    }
  }, [])

  const joinGame = async () => {
    if (!username.trim() || !ksyncRef.current) return

    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7']
    const color = colors[Math.floor(Math.random() * colors.length)]
    
    await ksyncRef.current.send('player-joined', {
      username: username.trim(),
      color,
    })

    setIsJoined(true)
  }

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !ksyncRef.current || !username || isSending) return

    setIsSending(true)
    try {
      await ksyncRef.current.send('chat-message', {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        username,
        message: chatInput.trim(),
        timestamp: Date.now(),
      })

      setChatInput('')
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      setIsSending(false)
    }
  }

  const handleMouseMove = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isJoined || !ksyncRef.current || !gameCanvasRef.current) return

    // Throttle mouse movements to prevent spam
    const now = Date.now()
    if (now - lastMoveTimeRef.current < 50) return // Max 20 moves per second
    lastMoveTimeRef.current = now

    const rect = gameCanvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    try {
      await ksyncRef.current.send('player-move', { x, y })
    } catch (error) {
      console.error('Failed to send move:', error)
    }
  }

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Connecting to game server...</p>
        </div>
      </div>
    )
  }

  if (!isJoined) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="text-6xl mb-4">🎮</div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">kSync Game</h1>
            <p className="text-gray-600">Enter your name to join the multiplayer game!</p>
          </div>
          
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && joinGame()}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              maxLength={20}
            />
            
            <button
              onClick={joinGame}
              disabled={!username.trim()}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Join Game
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 bg-gray-100">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <span className="text-2xl">🎮</span>
              <h1 className="text-2xl font-bold text-gray-800">kSync Multiplayer Game</h1>
            </div>
            
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                <span className="text-lg">👥</span>
                <span className="text-gray-600">{players.length} players</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Game Area */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow-lg p-4">
              <h2 className="text-lg font-semibold mb-4">Game Area</h2>
              <div
                ref={gameCanvasRef}
                className="relative w-full h-96 border-2 border-gray-300 rounded-lg bg-gradient-to-br from-blue-50 to-green-50 cursor-crosshair"
                onMouseMove={handleMouseMove}
              >
                {/* Players */}
                {players.map((player) => (
                  <div
                    key={player.id}
                    className="absolute rounded-full border-2 border-white shadow-lg transition-all duration-100"
                    style={{
                      left: player.x - 10,
                      top: player.y - 10,
                      width: '20px',
                      height: '20px',
                      backgroundColor: player.color,
                    }}
                    title={`${player.username} (${player.score})`}
                  >
                    <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 text-xs font-semibold text-gray-700 whitespace-nowrap bg-white bg-opacity-75 px-1 rounded">
                      {player.username}
                    </div>
                  </div>
                ))}

                {/* Instructions */}
                <div className="absolute bottom-4 left-4 text-sm text-gray-600 bg-white bg-opacity-75 p-2 rounded">
                  Move your mouse to control your player
                </div>
              </div>
            </div>
          </div>

          {/* Chat Area */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-lg p-4 h-96 flex flex-col">
              <div className="flex items-center space-x-2 mb-4">
                <span className="text-lg">💬</span>
                <h2 className="text-lg font-semibold">Chat</h2>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto space-y-2 mb-4 p-2 border border-gray-200 rounded bg-gray-50">
                {chatMessages.map((msg) => (
                  <div key={msg.id} className="p-2 bg-white rounded shadow-sm">
                    <div className="font-semibold text-sm text-blue-600">{msg.username}</div>
                    <div className="text-gray-800 text-sm">{msg.message}</div>
                  </div>
                ))}
                
                {chatMessages.length === 0 && (
                  <div className="text-gray-500 text-sm text-center py-4">
                    No messages yet. Start chatting!
                  </div>
                )}
              </div>

              {/* Chat input */}
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  maxLength={200}
                />
                <button
                  onClick={sendChatMessage}
                  disabled={!chatInput.trim() || isSending}
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  {isSending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Players List */}
        <div className="bg-white rounded-lg shadow-lg p-4 mt-4">
          <h2 className="text-lg font-semibold mb-4">Players ({players.length})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {players.map((player) => (
              <div key={player.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                <div
                  className="w-4 h-4 rounded-full border-2 border-white shadow"
                  style={{ backgroundColor: player.color }}
                />
                <div>
                  <div className="font-semibold text-gray-800">{player.username}</div>
                  <div className="text-sm text-gray-600">Score: {player.score}</div>
                </div>
              </div>
            ))}
          </div>
          
          {players.length === 0 && (
            <div className="text-gray-500 text-center py-4">
              No players online. Be the first to join!
            </div>
          )}
        </div>
      </div>
    </div>
  )
} 