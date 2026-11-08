/**
 * Utilities for resolving email reply recipients in the mobile app.
 *
 * Ensures replies and reply-all always target the other conversation participant(s),
 * never replying to the user themselves.
 */

export interface ReplyTargetMessage {
  id?: string;
  fromAddress: string;
  fromName?: string | null;
  toAddresses?: string | null;
  ccAddresses?: string | null;
  replyTo?: string | null;
  account?: {
    emailAddress?: string | null;
  } | null;
}

export interface ResolveReplyOptions {
  targetMessage: ReplyTargetMessage;
  threadMessages?: ReplyTargetMessage[];
  userEmails?: string[];
}

export interface ResolvedReplyRecipients {
  toAddress: string;
  displayName: string;
  replyAllTo: string[];
  replyAllCc: string[];
}

export function cleanEmail(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();
  const match = trimmed.match(/<([^>]+)>/);
  const target = match ? match[1] : trimmed;
  return target.replace(/^["']|["']$/g, "").trim().toLowerCase();
}

export interface ParsedContact {
  address: string;
  name: string | null;
}

export function parseContact(raw: string | null | undefined): ParsedContact | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const angleMatch = trimmed.match(/^(?:["']?([^"<>]*)["']?\s*)?<([^<>@\s]+@[^<>@\s]+)>$/);
  if (angleMatch) {
    const rawName = angleMatch[1]?.trim();
    const address = angleMatch[2].trim().toLowerCase();
    const name = rawName && rawName.length > 0 && rawName.toLowerCase() !== address ? rawName : null;
    return { address, name };
  }

  const simpleMatch = trimmed.match(
    /([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+)/
  );
  if (simpleMatch) {
    const address = simpleMatch[1].toLowerCase();
    let name: string | null = trimmed
      .replace(simpleMatch[0], "")
      .replace(/[<>"']/g, "")
      .trim();
    if (!name || name.toLowerCase() === address) name = null;
    return { address, name };
  }

  return null;
}

export function parseAddressList(raw: string | null | undefined): ParsedContact[] {
  if (!raw || typeof raw !== "string") return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        const results: ParsedContact[] = [];
        for (const item of parsed) {
          if (typeof item === "string") {
            const c = parseContact(item);
            if (c) results.push(c);
          } else if (item && typeof item === "object") {
            const addr = cleanEmail(item.address || item.email);
            if (addr) {
              const name =
                item.name && typeof item.name === "string" && item.name.trim().toLowerCase() !== addr
                  ? item.name.trim()
                  : null;
              results.push({ address: addr, name });
            }
          }
        }
        if (results.length > 0) return results;
      }
    } catch {}
  }

  const parts = trimmed.split(/[,;]/);
  const results: ParsedContact[] = [];
  for (const part of parts) {
    const c = parseContact(part);
    if (c) results.push(c);
  }
  return results;
}

export function resolveReplyRecipients(options: ResolveReplyOptions): ResolvedReplyRecipients {
  const { targetMessage, threadMessages = [], userEmails = [] } = options;

  const userEmailSet = new Set<string>();
  for (const email of userEmails) {
    const clean = cleanEmail(email);
    if (clean) userEmailSet.add(clean);
  }
  if (targetMessage.account?.emailAddress) {
    const clean = cleanEmail(targetMessage.account.emailAddress);
    if (clean) userEmailSet.add(clean);
  }

  const isUser = (email: string | null | undefined): boolean => {
    if (!email) return false;
    const clean = cleanEmail(email);
    return clean ? userEmailSet.has(clean) : false;
  };

  const targetFromClean = cleanEmail(targetMessage.fromAddress);
  const targetSentBySelf = isUser(targetFromClean);

  if (!targetSentBySelf) {
    const replyToClean = cleanEmail(targetMessage.replyTo);
    const primaryAddress =
      replyToClean && !isUser(replyToClean) ? replyToClean : targetFromClean;

    let displayName = primaryAddress;
    if (
      targetMessage.fromName &&
      targetMessage.fromName.trim() &&
      targetMessage.fromName.trim().toLowerCase() !== primaryAddress
    ) {
      displayName = targetMessage.fromName.trim();
    }

    const toContacts = parseAddressList(targetMessage.toAddresses);
    const ccContacts = parseAddressList(targetMessage.ccAddresses);
    const seen = new Set<string>([primaryAddress]);

    const replyAllCc: string[] = [];
    for (const c of [...toContacts, ...ccContacts]) {
      const addr = cleanEmail(c.address);
      if (addr && !isUser(addr) && !seen.has(addr)) {
        seen.add(addr);
        replyAllCc.push(addr);
      }
    }

    return {
      toAddress: primaryAddress,
      displayName,
      replyAllTo: primaryAddress ? [primaryAddress] : [],
      replyAllCc,
    };
  }

  let otherPersonAddress = "";
  let otherPersonName: string | null = null;

  if (threadMessages && threadMessages.length > 0) {
    for (let i = threadMessages.length - 1; i >= 0; i--) {
      const msg = threadMessages[i];
      const msgFromClean = cleanEmail(msg.fromAddress);
      if (msgFromClean && !isUser(msgFromClean)) {
        const msgReplyToClean = cleanEmail(msg.replyTo);
        otherPersonAddress =
          msgReplyToClean && !isUser(msgReplyToClean) ? msgReplyToClean : msgFromClean;
        if (
          msg.fromName &&
          msg.fromName.trim() &&
          msg.fromName.trim().toLowerCase() !== otherPersonAddress
        ) {
          otherPersonName = msg.fromName.trim();
        }
        break;
      }
    }
  }

  const targetToContacts = parseAddressList(targetMessage.toAddresses);
  if (!otherPersonAddress) {
    for (const c of targetToContacts) {
      const addr = cleanEmail(c.address);
      if (addr && !isUser(addr)) {
        otherPersonAddress = addr;
        otherPersonName = c.name;
        break;
      }
    }
  }

  const targetCcContacts = parseAddressList(targetMessage.ccAddresses);
  if (!otherPersonAddress) {
    for (const c of targetCcContacts) {
      const addr = cleanEmail(c.address);
      if (addr && !isUser(addr)) {
        otherPersonAddress = addr;
        otherPersonName = c.name;
        break;
      }
    }
  }

  if (!otherPersonAddress) {
    otherPersonAddress = targetFromClean || cleanEmail(targetMessage.toAddresses) || "me";
    otherPersonName = targetMessage.fromName?.trim() || null;
  }

  const displayName =
    otherPersonName &&
    otherPersonName.trim().length > 0 &&
    otherPersonName.trim().toLowerCase() !== otherPersonAddress
      ? otherPersonName.trim()
      : otherPersonAddress;

  const seenAll = new Set<string>();
  const replyAllTo: string[] = [];

  if (otherPersonAddress && !isUser(otherPersonAddress)) {
    seenAll.add(otherPersonAddress);
    replyAllTo.push(otherPersonAddress);
  }

  const replyAllCc: string[] = [];

  for (const c of [...targetToContacts, ...targetCcContacts]) {
    const addr = cleanEmail(c.address);
    if (addr && !isUser(addr) && !seenAll.has(addr)) {
      seenAll.add(addr);
      replyAllCc.push(addr);
    }
  }

  if (threadMessages && threadMessages.length > 0) {
    for (const msg of threadMessages) {
      const fromAddr = cleanEmail(msg.fromAddress);
      if (fromAddr && !isUser(fromAddr) && !seenAll.has(fromAddr)) {
        seenAll.add(fromAddr);
        replyAllCc.push(fromAddr);
      }
      for (const c of [
        ...parseAddressList(msg.toAddresses),
        ...parseAddressList(msg.ccAddresses),
      ]) {
        const addr = cleanEmail(c.address);
        if (addr && !isUser(addr) && !seenAll.has(addr)) {
          seenAll.add(addr);
          replyAllCc.push(addr);
        }
      }
    }
  }

  return {
    toAddress: otherPersonAddress,
    displayName,
    replyAllTo: replyAllTo.length > 0 ? replyAllTo : [otherPersonAddress],
    replyAllCc,
  };
}
