import React, { useState, useEffect } from 'react';
import { createChat, KSyncEvent } from '../src/index';

// 🎯 Simple Chat App with KSync
function SimpleChatApp() {
  const [ksync] = useState(() => createChat('my-chat-room'));
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState<string[]>([]);

  useEffect(() => {
    // Listen for messages
    ksync.on('message', (data: any) => {
      setMessages(prev => [...prev, data]);
    });

    // Listen for typing events
    ksync.on('typing', (data: any) => {
      setTyping(prev => {
        const updated = [...prev];
        if (!updated.includes(data.userId)) {
          updated.push(data.userId);
        }
        return updated;
      });
      
      // Remove typing indicator after 3 seconds
      setTimeout(() => {
        setTyping(prev => prev.filter(id => id !== data.userId));
      }, 3000);
    });

    return () => {
      ksync.off('message', () => {});
      ksync.off('typing', () => {});
    };
  }, [ksync]);

  const sendMessage = async () => {
    if (input.trim()) {
      await ksync.send('message', {
        text: input,
        userId: 'user-' + Math.random().toString(36).substr(2, 9),
        timestamp: Date.now()
      });
      setInput('');
    }
  };

  const sendTyping = async () => {
    await ksync.send('typing', {
      userId: 'user-' + Math.random().toString(36).substr(2, 9),
      timestamp: Date.now()
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      sendMessage();
    } else {
      sendTyping();
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>💬 Simple Chat</h1>
        <div>Status: Online</div>
      </div>

      {/* Messages */}
      <div style={{ 
        height: '400px', 
        border: '1px solid #ddd', 
        borderRadius: '8px', 
        padding: '10px',
        marginBottom: '10px',
        overflowY: 'auto',
        background: '#f9f9f9'
      }}>
        {messages.map((msg: any, i: number) => (
          <div key={i} style={{ 
            marginBottom: '10px',
            padding: '8px',
            background: 'white',
            borderRadius: '4px'
          }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
              {msg.userId} • {new Date(msg.timestamp).toLocaleTimeString()}
            </div>
            <div>{msg.text}</div>
          </div>
        ))}
        
        {/* Typing indicator */}
        {typing.length > 0 && (
          <div style={{ fontStyle: 'italic', color: '#666', padding: '8px' }}>
            {typing.join(', ')} {typing.length === 1 ? 'is' : 'are'} typing...
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: '10px' }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type a message... (works offline!)"
          style={{ 
            flex: 1, 
            padding: '10px', 
            border: '1px solid #ddd', 
            borderRadius: '4px',
            fontSize: '16px'
          }}
        />
        <button 
          onClick={sendMessage}
          style={{ 
            padding: '10px 20px', 
            background: '#007bff', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px',
            fontSize: '16px',
            cursor: 'pointer'
          }}
        >
          Send
        </button>
      </div>

      <div style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
        💡 Works offline! Messages sync automatically when connection returns.
      </div>
    </div>
  );
}

export default SimpleChatApp;

// 🚀 Server setup example
/*
import { KSyncServer } from '../src/server/ksync-server';

const server = new KSyncServer({ port: 8080 });
await server.start();
console.log('🚀 Chat server running on port 8080!');
*/ 