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
  
  const ksyncRef = useRef<any>(null)
  const gameCanvasRef = useRef<HTMLDivElement>(null)

  // Initialize kSync
  useEffect(() => {
    const initKSync = async () => {
      try {
        const ksync = createKSync({
          serverUrl: 'ws://localhost:8080',
          debug: true,
        })

        // Define schemas
        ksync.defineSchema('chat-message', ChatMessageSchema)
        ksync.defineSchema('player-joined', PlayerJoinedSchema)
        ksync.defineSchema('player-move', PlayerMoveSchema)
        ksync.defineSchema('game-state-update', GameStateUpdateSchema)

        // Set up event listeners
        ksync.on('chat-message', (event: any) => {
          setChatMessages(prev => [...prev, event.data])
        })

        ksync.on('game-state-update', (event: any) => {
          setPlayers(event.data.players)
        })

        await ksync.initialize()
        ksyncRef.current = ksync
        setIsConnected(true)
      } catch (error) {
        console.error('Failed to initialize kSync:', error)
      }
    }

    initKSync()
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
    if (!chatInput.trim() || !ksyncRef.current || !username) return

    await ksyncRef.current.send('chat-message', {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      username,
      message: chatInput.trim(),
      timestamp: Date.now(),
    })

    setChatInput('')
  }

  const handleMouseMove = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isJoined || !ksyncRef.current || !gameCanvasRef.current) return

    const rect = gameCanvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    await ksyncRef.current.send('player-move', { x, y })
  }

  if (!isConnected) {
    return React.createElement('div', {
      style: { 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '100vh' 
      }
    }, 'Connecting to game server...')
  }

  if (!isJoined) {
    return React.createElement('div', {
      style: { 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '100vh',
        padding: '20px'
      }
    }, [
      React.createElement('div', {
        key: 'join-form',
        style: {
          background: 'white',
          padding: '40px',
          borderRadius: '10px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          maxWidth: '400px',
          width: '100%'
        }
      }, [
        React.createElement('h1', {
          key: 'title',
          style: { textAlign: 'center', marginBottom: '20px', fontSize: '24px' }
        }, 'kSync Multiplayer Game'),
        React.createElement('input', {
          key: 'username-input',
          type: 'text',
          placeholder: 'Enter your username',
          value: username,
          onChange: (e: any) => setUsername(e.target.value),
          onKeyPress: (e: any) => e.key === 'Enter' && joinGame(),
          style: {
            width: '100%',
            padding: '12px',
            marginBottom: '20px',
            border: '1px solid #ccc',
            borderRadius: '5px',
            fontSize: '16px'
          }
        }),
        React.createElement('button', {
          key: 'join-button',
          onClick: joinGame,
          disabled: !username.trim(),
          style: {
            width: '100%',
            padding: '12px',
            backgroundColor: username.trim() ? '#007bff' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            fontSize: '16px',
            cursor: username.trim() ? 'pointer' : 'not-allowed'
          }
        }, 'Join Game')
      ])
    ])
  }

  return React.createElement('div', {
    style: { minHeight: '100vh', padding: '20px', backgroundColor: '#f5f5f5' }
  }, [
    // Header
    React.createElement('div', {
      key: 'header',
      style: {
        background: 'white',
        padding: '20px',
        borderRadius: '10px',
        marginBottom: '20px',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
      }
    }, [
      React.createElement('h1', {
        key: 'header-title',
        style: { margin: 0, fontSize: '24px' }
      }, `kSync Game - ${players.length} players online`)
    ]),

    // Game and Chat Container
    React.createElement('div', {
      key: 'game-container',
      style: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }
    }, [
      // Game Area
      React.createElement('div', {
        key: 'game-area',
        style: {
          background: 'white',
          padding: '20px',
          borderRadius: '10px',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
        }
      }, [
        React.createElement('h2', {
          key: 'game-title',
          style: { marginTop: 0, marginBottom: '20px' }
        }, 'Game Area'),
        React.createElement('div', {
          key: 'game-canvas',
          ref: gameCanvasRef,
          onMouseMove: handleMouseMove,
          style: {
            position: 'relative',
            width: '100%',
            height: '400px',
            border: '2px solid #ddd',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #e3f2fd 0%, #f1f8e9 100%)',
            cursor: 'crosshair'
          }
        }, [
          // Players
          ...players.map((player) => 
            React.createElement('div', {
              key: player.id,
              style: {
                position: 'absolute',
                left: player.x - 10,
                top: player.y - 10,
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                backgroundColor: player.color,
                border: '2px solid white',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                transition: 'all 0.1s ease'
              },
              title: `${player.username} (${player.score})`
            }, [
              React.createElement('div', {
                key: 'player-name',
                style: {
                  position: 'absolute',
                  top: '-30px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  color: '#333',
                  whiteSpace: 'nowrap',
                  background: 'rgba(255, 255, 255, 0.8)',
                  padding: '2px 6px',
                  borderRadius: '3px'
                }
              }, player.username)
            ])
          ),
          // Instructions
          React.createElement('div', {
            key: 'instructions',
            style: {
              position: 'absolute',
              bottom: '10px',
              left: '10px',
              fontSize: '14px',
              color: '#666',
              background: 'rgba(255, 255, 255, 0.8)',
              padding: '8px',
              borderRadius: '5px'
            }
          }, 'Move your mouse to control your player')
        ])
      ]),

      // Chat Area
      React.createElement('div', {
        key: 'chat-area',
        style: {
          background: 'white',
          padding: '20px',
          borderRadius: '10px',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          height: '460px'
        }
      }, [
        React.createElement('h2', {
          key: 'chat-title',
          style: { marginTop: 0, marginBottom: '20px' }
        }, 'Chat'),
        
        // Messages
        React.createElement('div', {
          key: 'messages',
          style: {
            flex: 1,
            overflowY: 'auto',
            marginBottom: '20px',
            padding: '10px',
            border: '1px solid #eee',
            borderRadius: '5px',
            backgroundColor: '#fafafa'
          }
        }, chatMessages.map((msg) =>
          React.createElement('div', {
            key: msg.id,
            style: {
              marginBottom: '10px',
              padding: '8px',
              backgroundColor: '#f0f0f0',
              borderRadius: '5px'
            }
          }, [
            React.createElement('div', {
              key: 'msg-username',
              style: { fontWeight: 'bold', fontSize: '14px', color: '#007bff' }
            }, msg.username),
            React.createElement('div', {
              key: 'msg-content',
              style: { fontSize: '14px', color: '#333' }
            }, msg.message)
          ])
        )),

        // Chat input
        React.createElement('div', {
          key: 'chat-input',
          style: { display: 'flex', gap: '10px' }
        }, [
          React.createElement('input', {
            key: 'chat-input-field',
            type: 'text',
            placeholder: 'Type a message...',
            value: chatInput,
            onChange: (e: any) => setChatInput(e.target.value),
            onKeyPress: (e: any) => e.key === 'Enter' && sendChatMessage(),
            style: {
              flex: 1,
              padding: '8px',
              border: '1px solid #ccc',
              borderRadius: '5px',
              fontSize: '14px'
            }
          }),
          React.createElement('button', {
            key: 'send-button',
            onClick: sendChatMessage,
            disabled: !chatInput.trim(),
            style: {
              padding: '8px 16px',
              backgroundColor: chatInput.trim() ? '#007bff' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: chatInput.trim() ? 'pointer' : 'not-allowed'
            }
          }, 'Send')
        ])
      ])
    ]),

    // Players List
    React.createElement('div', {
      key: 'players-list',
      style: {
        background: 'white',
        padding: '20px',
        borderRadius: '10px',
        marginTop: '20px',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
      }
    }, [
      React.createElement('h2', {
        key: 'players-title',
        style: { marginTop: 0, marginBottom: '20px' }
      }, `Players (${players.length})`),
      React.createElement('div', {
        key: 'players-grid',
        style: {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '10px'
        }
      }, players.map((player) =>
        React.createElement('div', {
          key: player.id,
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px',
            backgroundColor: '#f8f9fa',
            borderRadius: '5px'
          }
        }, [
          React.createElement('div', {
            key: 'player-color',
            style: {
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              backgroundColor: player.color,
              border: '2px solid white',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
            }
          }),
          React.createElement('div', {
            key: 'player-info'
          }, [
            React.createElement('div', {
              key: 'player-name',
              style: { fontWeight: 'bold', fontSize: '14px' }
            }, player.username),
            React.createElement('div', {
              key: 'player-score',
              style: { fontSize: '12px', color: '#666' }
            }, `Score: ${player.score}`)
          ])
        ])
      ))
    ])
  ])
} 