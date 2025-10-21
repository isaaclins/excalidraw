import { useState, useEffect, useRef } from 'react';
import { ChatMessage } from '../lib/websocket';
import './ChatPanel.css';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  currentUserId?: string;
}

export function ChatPanel({ messages, onSendMessage, currentUserId }: ChatPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isExpanded) {
      scrollToBottom();
    }
  }, [messages, isExpanded]);

  const handleSend = () => {
    if (inputValue.trim()) {
      onSendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`chat-panel ${isExpanded ? '' : 'collapsed'}`}>
      <div className="chat-panel-header" onClick={() => setIsExpanded(!isExpanded)}>
        <span className="chat-panel-title">
          Chat {messages.length > 0 && `(${messages.length})`}
        </span>
        <button className="chat-panel-toggle" onClick={(e) => {
          e.stopPropagation();
          setIsExpanded(!isExpanded);
        }}>
          {isExpanded ? '▼' : '▲'}
        </button>
      </div>
      
      {isExpanded && (
        <>
          <div className="chat-panel-messages">
            {messages.length === 0 ? (
              <div className="chat-panel-empty">
                No messages yet. Start the conversation!
              </div>
            ) : (
              messages.map((message) => {
                const isOwnMessage = message.sender === currentUserId;
                return (
                  <div
                    key={message.id}
                    className={`chat-message ${isOwnMessage ? 'own-message' : 'other-message'}`}
                  >
                    <div className="chat-message-sender">
                      {isOwnMessage ? 'You' : message.sender.substring(0, 8)}
                    </div>
                    <div className="chat-message-content">{message.content}</div>
                    <div className="chat-message-timestamp">
                      {formatTimestamp(message.timestamp)}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
          
          <div className="chat-panel-input-container">
            <input
              type="text"
              className="chat-panel-input"
              placeholder="Type a message..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
            />
            <button
              className="chat-panel-send-button"
              onClick={handleSend}
              disabled={!inputValue.trim()}
            >
              Send
            </button>
          </div>
        </>
      )}
    </div>
  );
}
