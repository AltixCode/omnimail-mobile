import {
  getServerUrl,
  getAuthToken,
  setAuthToken,
  setUser,
  clearAllAuthData,
} from "./storage";
import {
  User,
  MailAccount,
  Folder,
  MessageListItem,
  MessageDetail,
  MessageListResponse,
  CalendarResponse,
  CalendarEvent,
  DeviceRecord,
} from "../types";

export class ApiError extends Error {
  status: number;
  data?: any;

  constructor(message: string, status: number = 500, data?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { serverUrlOverride?: string } = {}
): Promise<T> {
  const { serverUrlOverride, ...fetchOptions } = options;
  const baseUrl = serverUrlOverride || (await getServerUrl());
  const token = await getAuthToken();

  const url = `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (!(fetchOptions.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    response = await fetch(url, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new ApiError("Connection timed out. Please check your network.", 408);
    }
    throw new ApiError(
      `Cannot connect to server at ${baseUrl}. Please check the server URL or your internet connection.`,
      0
    );
  }

  let data: any;
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errorMessage =
      (typeof data === "object" && data !== null && (data.error || data.message)) ||
      `Request failed with status ${response.status}`;
    throw new ApiError(errorMessage, response.status, data);
  }

  return data as T;
}

export const api = {
  auth: {
    async login(email: string, password: string, serverUrlOverride?: string): Promise<{ user: User; token: string }> {
      const result = await request<{
        success: boolean;
        token?: string;
        user: User;
        error?: string;
      }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
        serverUrlOverride,
      });

      if (!result.token) {
        throw new ApiError("Server did not return an authentication token", 500);
      }

      await setAuthToken(result.token);
      await setUser(result.user);

      return { user: result.user, token: result.token };
    },

    async register(
      data: { email: string; password: string; name?: string },
      serverUrlOverride?: string
    ): Promise<{ user: User; token: string }> {
      const result = await request<{
        success: boolean;
        token?: string;
        user: User;
        error?: string;
      }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
        serverUrlOverride,
      });

      if (!result.token) {
        throw new ApiError("Server did not return an authentication token", 500);
      }

      await setAuthToken(result.token);
      await setUser(result.user);

      return { user: result.user, token: result.token };
    },

    async me(): Promise<{ user: User }> {
      return await request<{ user: User }>("/api/auth/me");
    },

    async logout(): Promise<void> {
      try {
        await request("/api/auth/logout", { method: "POST" });
      } catch {
        // Ignore network errors on logout
      } finally {
        await clearAllAuthData();
      }
    },
  },

  messages: {
    async list(params: {
      page?: number;
      limit?: number;
      view?: string;
      accountId?: string;
      folderId?: string;
      unreadOnly?: boolean;
      starredOnly?: boolean;
      hasAttachments?: boolean;
      query?: string;
    }): Promise<MessageListResponse> {
      const query = new URLSearchParams();
      if (params.page) query.set("page", params.page.toString());
      if (params.limit) query.set("limit", params.limit.toString());
      if (params.view) query.set("view", params.view);
      if (params.accountId) query.set("accountId", params.accountId);
      if (params.folderId) query.set("folderId", params.folderId);
      if (params.unreadOnly) query.set("unreadOnly", "true");
      if (params.starredOnly) query.set("starredOnly", "true");
      if (params.hasAttachments) query.set("hasAttachments", "true");
      if (params.query) query.set("query", params.query);

      const qs = query.toString();
      return await request<MessageListResponse>(`/api/messages${qs ? `?${qs}` : ""}`);
    },

    async get(id: string): Promise<{ message: MessageDetail; thread?: MessageDetail[] }> {
      return await request<{ message: MessageDetail; thread?: MessageDetail[] }>(
        `/api/messages/${id}`
      );
    },

    async update(
      id: string,
      updates: { isRead?: boolean; isStarred?: boolean; folderId?: string }
    ): Promise<{ success: boolean; message: MessageDetail }> {
      return await request<{ success: boolean; message: MessageDetail }>(
        `/api/messages/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify(updates),
        }
      );
    },

    async delete(id: string): Promise<{ success: boolean }> {
      return await request<{ success: boolean }>(`/api/messages/${id}`, {
        method: "DELETE",
      });
    },

    async batch(
      messageIds: string[],
      action: "mark-read" | "mark-unread" | "star" | "unstar" | "trash" | "archive" | "inbox" | "delete"
    ): Promise<{ success: boolean; affectedCount: number }> {
      return await request<{ success: boolean; affectedCount: number }>(
        "/api/messages/batch",
        {
          method: "POST",
          body: JSON.stringify({ messageIds, action }),
        }
      );
    },

    async send(data: {
      accountId: string;
      to: string[] | string;
      cc?: string[] | string;
      bcc?: string[] | string;
      subject: string;
      bodyText?: string;
      bodyHtml?: string;
      inReplyTo?: string;
      references?: string;
      threadId?: string;
      attachments?: Array<{
        filename: string;
        content: string; // base64
        contentType: string;
        size?: number;
      }>;
    }): Promise<{ success: boolean; messageId?: string }> {
      return await request<{ success: boolean; messageId?: string }>(
        "/api/messages/send",
        {
          method: "POST",
          body: JSON.stringify(data),
        }
      );
    },
  },

  accounts: {
    async list(): Promise<{ accounts: MailAccount[] }> {
      return await request<{ accounts: MailAccount[] }>("/api/accounts");
    },

    async create(data: {
      label: string;
      emailAddress: string;
      imapHost: string;
      imapPort?: number;
      imapSecure?: boolean;
      imapUser: string;
      imapPassword: string;
      smtpHost: string;
      smtpPort?: number;
      smtpSecure?: boolean;
      smtpUser: string;
      smtpPassword: string;
      caldavUrl?: string;
      caldavUser?: string;
      caldavPassword?: string;
    }): Promise<{ success: boolean; account: MailAccount }> {
      return await request<{ success: boolean; account: MailAccount }>("/api/accounts", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },

    async test(data: {
      imapHost: string;
      imapPort?: number;
      imapSecure?: boolean;
      imapUser: string;
      imapPassword: string;
      smtpHost: string;
      smtpPort?: number;
      smtpSecure?: boolean;
      smtpUser: string;
      smtpPassword: string;
    }): Promise<{ success: boolean; imapSuccess: boolean; smtpSuccess: boolean; error?: string }> {
      return await request<{ success: boolean; imapSuccess: boolean; smtpSuccess: boolean; error?: string }>(
        "/api/accounts/test",
        {
          method: "POST",
          body: JSON.stringify(data),
        }
      );
    },

    async delete(id: string): Promise<{ success: boolean }> {
      return await request<{ success: boolean }>(`/api/accounts/${id}`, {
        method: "DELETE",
      });
    },
  },

  folders: {
    async list(): Promise<{
      accounts: {
        id: string;
        label: string;
        emailAddress: string;
        folders: Folder[];
      }[];
      unifiedCounts: {
        inboxUnread: number;
        starred: number;
      };
    }> {
      return await request<any>("/api/folders");
    },
  },

  sync: {
    async trigger(accountId?: string): Promise<{ success: boolean }> {
      return await request<{ success: boolean }>("/api/sync", {
        method: "POST",
        body: JSON.stringify(accountId ? { accountId } : {}),
      });
    },
  },

  calendar: {
    async get(params: {
      start?: string;
      end?: string;
      calendarId?: string;
      accountId?: string;
    } = {}): Promise<CalendarResponse> {
      const query = new URLSearchParams();
      if (params.start) query.set("start", params.start);
      if (params.end) query.set("end", params.end);
      if (params.calendarId) query.set("calendarId", params.calendarId);
      if (params.accountId) query.set("accountId", params.accountId);

      const qs = query.toString();
      return await request<CalendarResponse>(`/api/calendar${qs ? `?${qs}` : ""}`);
    },

    async createEvent(data: {
      calendarId?: string;
      accountId?: string;
      summary: string;
      description?: string;
      location?: string;
      startDate: string;
      endDate: string;
      isAllDay?: boolean;
    }): Promise<{ success: boolean; event: CalendarEvent }> {
      return await request<{ success: boolean; event: CalendarEvent }>(
        "/api/calendar",
        {
          method: "POST",
          body: JSON.stringify(data),
        }
      );
    },
  },

  devices: {
    async register(data: {
      token: string;
      platform: string;
      deviceId?: string;
      deviceModel?: string;
    }): Promise<{ success: boolean; device: DeviceRecord }> {
      return await request<{ success: boolean; device: DeviceRecord }>(
        "/api/devices",
        {
          method: "POST",
          body: JSON.stringify(data),
        }
      );
    },

    async unregister(token: string): Promise<{ success: boolean }> {
      return await request<{ success: boolean }>(
        `/api/devices?token=${encodeURIComponent(token)}`,
        {
          method: "DELETE",
        }
      );
    },

    async list(): Promise<{ success: boolean; devices: DeviceRecord[] }> {
      return await request<{ success: boolean; devices: DeviceRecord[] }>(
        "/api/devices"
      );
    },

    async testPush(title?: string, body?: string): Promise<{ success: boolean; result: any }> {
      return await request<{ success: boolean; result: any }>(
        "/api/devices/test-push",
        {
          method: "POST",
          body: JSON.stringify({ title, body }),
        }
      );
    },
  },
};
