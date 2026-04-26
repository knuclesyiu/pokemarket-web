// Chat types for DM feature

export interface ChatThread {
  id: string;
  listingId?: string;
  parties: string[];           // sorted [uidA, uidB]
  lastMessage?: string;
  lastMessageAt: number;
  unreadCount: Record<string, number>; // uid → badge count
  createdAt: number;
  // Denormalized for display
  otherPartyName?: string;
  otherPartyId?: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: number;
  readBy: string[];
  type: 'text' | 'system';
}