/**
 * Microsoft Graph API client for email sending and inbox polling.
 *
 * Uses Client Credentials flow (application permissions):
 *   - Mail.Send        — send approval emails from the purchasing mailbox
 *   - Mail.ReadWrite   — read replies, mark processed messages
 *
 * Requires IT admin consent in Azure AD for these application permissions.
 *
 * Setup:
 *   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_EMAIL_ADDRESS
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

interface TokenCache {
  token: string;
  expiresAt: number;
}
let _tokenCache: TokenCache | null = null;

/** Get (or refresh) an app-level access token via client credentials. */
async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (_tokenCache && _tokenCache.expiresAt > now + 60_000) {
    return _tokenCache.token;
  }

  const tenantId = process.env.MS_TENANT_ID;
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Microsoft Graph not configured. Set MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET.");
  }

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    { method: "POST", body: params }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph token error: ${res.status} ${err}`);
  }

  const data = await res.json();
  _tokenCache = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return _tokenCache.token;
}

/** Low-level authenticated Graph request. */
async function graphRequest(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAccessToken();
  return fetch(`${GRAPH_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
}

// ─── Email Sending ────────────────────────────────────────────────────────────

export interface SendMailParams {
  to: string;
  subject: string;
  bodyHtml: string;
  replyTo?: string;
  /** Used to thread replies — sets the In-Reply-To / References headers via custom headers */
  conversationId?: string;
}

/**
 * Send an email from the purchasing mailbox.
 * Returns the Message-ID of the sent message.
 */
export async function sendMail(params: SendMailParams): Promise<{ messageId: string }> {
  const mailbox = process.env.MS_EMAIL_ADDRESS;
  if (!mailbox) throw new Error("MS_EMAIL_ADDRESS not configured");

  const message: Record<string, unknown> = {
    subject: params.subject,
    body: { contentType: "HTML", content: params.bodyHtml },
    toRecipients: [{ emailAddress: { address: params.to } }],
    replyTo: params.replyTo
      ? [{ emailAddress: { address: params.replyTo } }]
      : undefined,
  };

  const res = await graphRequest(`/users/${mailbox}/sendMail`, {
    method: "POST",
    body: JSON.stringify({ message, saveToSentItems: true }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`sendMail failed: ${res.status} ${err}`);
  }

  // Graph doesn't return the message ID from sendMail — fetch the last sent item
  const sentRes = await graphRequest(
    `/users/${mailbox}/mailFolders/SentItems/messages?$top=1&$select=id,internetMessageId&$orderby=sentDateTime desc`
  );
  const sentData = await sentRes.json();
  const messageId: string = sentData.value?.[0]?.internetMessageId ?? sentData.value?.[0]?.id ?? "";
  return { messageId };
}

// ─── Inbox Polling ────────────────────────────────────────────────────────────

export interface InboxMessage {
  id: string;
  internetMessageId: string;
  conversationId: string;
  subject: string;
  from: string;
  receivedAt: string;
  bodyText: string;
  bodyHtml: string;
  isRead: boolean;
  inReplyTo?: string;
}

/**
 * Fetch unread messages from the purchasing mailbox inbox.
 * Pass `since` (ISO date string) to only fetch messages after that time.
 */
export async function fetchUnreadMessages(since?: string): Promise<InboxMessage[]> {
  const mailbox = process.env.MS_EMAIL_ADDRESS;
  if (!mailbox) throw new Error("MS_EMAIL_ADDRESS not configured");

  let filter = "isRead eq false";
  if (since) {
    filter += ` and receivedDateTime gt ${since}`;
  }

  const res = await graphRequest(
    `/users/${mailbox}/mailFolders/inbox/messages` +
      `?$filter=${encodeURIComponent(filter)}` +
      `&$select=id,internetMessageId,conversationId,subject,from,receivedDateTime,body,isRead,singleValueExtendedProperties` +
      `&$expand=singleValueExtendedProperties($filter=id eq 'String 0x1042')` + // In-Reply-To header
      `&$top=50` +
      `&$orderby=receivedDateTime asc`
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`fetchUnreadMessages failed: ${res.status} ${err}`);
  }

  const data = await res.json();
  return (data.value ?? []).map((msg: any) => ({
    id: msg.id,
    internetMessageId: msg.internetMessageId ?? "",
    conversationId: msg.conversationId ?? "",
    subject: msg.subject ?? "",
    from: msg.from?.emailAddress?.address ?? "",
    receivedAt: msg.receivedDateTime ?? "",
    bodyText: stripHtml(msg.body?.content ?? ""),
    bodyHtml: msg.body?.content ?? "",
    isRead: msg.isRead ?? false,
    inReplyTo: msg.singleValueExtendedProperties?.[0]?.value ?? undefined,
  }));
}

/** Mark a message as read so we don't re-process it. */
export async function markAsRead(messageId: string): Promise<void> {
  const mailbox = process.env.MS_EMAIL_ADDRESS;
  if (!mailbox) throw new Error("MS_EMAIL_ADDRESS not configured");

  await graphRequest(`/users/${mailbox}/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify({ isRead: true }),
  });
}

/** Move a processed message to a "Stamped/Processed" folder (creates it if needed). */
export async function moveToProcessed(messageId: string): Promise<void> {
  const mailbox = process.env.MS_EMAIL_ADDRESS;
  if (!mailbox) return;

  const folderId = await ensureFolder("Stamped-Processed");
  if (!folderId) return;

  await graphRequest(`/users/${mailbox}/messages/${messageId}/move`, {
    method: "POST",
    body: JSON.stringify({ destinationId: folderId }),
  });
}

let _processedFolderId: string | null = null;
async function ensureFolder(displayName: string): Promise<string | null> {
  if (_processedFolderId) return _processedFolderId;
  const mailbox = process.env.MS_EMAIL_ADDRESS!;

  // Check if it exists
  const listRes = await graphRequest(
    `/users/${mailbox}/mailFolders?$filter=${encodeURIComponent(`displayName eq '${displayName}'`)}`
  );
  const listData = await listRes.json();
  if (listData.value?.length > 0) {
    _processedFolderId = listData.value[0].id;
    return _processedFolderId;
  }

  // Create it
  const createRes = await graphRequest(`/users/${mailbox}/mailFolders`, {
    method: "POST",
    body: JSON.stringify({ displayName }),
  });
  if (!createRes.ok) return null;
  const created = await createRes.json();
  _processedFolderId = created.id ?? null;
  return _processedFolderId;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export const graphConfigured =
  !!process.env.MS_TENANT_ID &&
  !!process.env.MS_CLIENT_ID &&
  !!process.env.MS_CLIENT_SECRET &&
  !!process.env.MS_EMAIL_ADDRESS;
