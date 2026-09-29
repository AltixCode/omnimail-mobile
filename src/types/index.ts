export interface User {
  id: string;
  email: string;
  name: string | null;
}

export interface MailAccount {
  id: string;
  label: string;
  emailAddress: string;
  syncStatus?: string | null;
  lastSyncAt?: string | null;
  folders?: Folder[];
  hasCaldav?: boolean;
}

export interface Folder {
  id: string;
  accountId: string;
  name: string;
  path: string;
  specialUse?: string | null;
  unreadCount: number;
  totalCount: number;
}

export interface Attachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  contentId?: string | null;
  dataBase64?: string | null;
}

export interface MessageListItem {
  id: string;
  accountId: string;
  folderId: string;
  uid: number;
  messageId: string | null;
  threadId: string | null;
  fromAddress: string;
  fromName: string | null;
  toAddresses: string; // JSON array string or parsed
  subject: string | null;
  date: string;
  snippet: string | null;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  hasCalendarInvite?: boolean;
  account?: {
    label: string;
    emailAddress: string;
  };
  folder?: {
    name: string;
    specialUse: string | null;
  };
}

export interface MessageDetail extends MessageListItem {
  bodyText?: string | null;
  bodyHtml?: string | null;
  ccAddresses?: string | null;
  bccAddresses?: string | null;
  replyTo?: string | null;
  flags?: string;
  account?: {
    id: string;
    userId: string;
    label: string;
    emailAddress: string;
  };
  folder?: {
    id: string;
    name: string;
    path: string;
    specialUse: string | null;
  };
  attachments: Attachment[];
}

export interface Calendar {
  id: string;
  accountId: string;
  name: string;
  color: string;
  account?: {
    id: string;
    label: string;
    emailAddress: string;
  };
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  startDate: string;
  endDate: string;
  isAllDay: boolean;
  timezone?: string | null;
  rrule?: string | null;
  calendar?: {
    id: string;
    name: string;
    color: string;
    account?: {
      label: string;
      emailAddress: string;
    };
  };
}

export interface DeviceRecord {
  id: string;
  token: string;
  platform: string;
  deviceId?: string | null;
  deviceModel?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageListResponse {
  messages: MessageListItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface CalendarResponse {
  calendars: Calendar[];
  events: CalendarEvent[];
}
