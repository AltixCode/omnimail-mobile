import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { WebView } from "react-native-webview";
import { format, parseISO } from "date-fns";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  ArrowLeft,
  Star,
  Mail,
  Archive,
  Trash2,
  Reply,
  ReplyAll,
  Forward,
  Paperclip,
  Share2,
  Calendar,
  MoreVertical,
  Check,
  Download,
  FileText,
  Shield,
  ShieldCheck,
} from "lucide-react-native";
import { useTheme } from "../../src/context/ThemeContext";
import { api } from "../../src/services/api";
import { getServerUrl, getAuthToken } from "../../src/services/storage";
import { MessageDetail } from "../../src/types";
import { Spacing, Typography } from "../../src/constants/theme";

export default function MessageDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, isDark } = useTheme();

  const [message, setMessage] = useState<MessageDetail | null>(null);
  const [thread, setThread] = useState<MessageDetail[]>([]);
  const [webViewHeight, setWebViewHeight] = useState(300);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Remote image privacy: blocked by default, same policy as the web app.
  const [trustedSenders, setTrustedSenders] = useState<Set<string>>(new Set());
  const [loadRemoteImages, setLoadRemoteImages] = useState(false);
  const [trustingSender, setTrustingSender] = useState(false);

  useEffect(() => {
    api.settings.trustedSenders
      .list()
      .then((res) => {
        setTrustedSenders(
          new Set((res.senders || []).map((s) => s.email.toLowerCase())),
        );
      })
      .catch(() => {});
  }, []);

  const cleanSenderEmail =
    (message?.fromAddress || "")
      .trim()
      .toLowerCase()
      .match(/<([^>]+)>/)?.[1]
      ?.trim() || (message?.fromAddress || "").trim().toLowerCase();

  const isSenderTrusted = (() => {
    if (!cleanSenderEmail || trustedSenders.size === 0) return false;
    if (trustedSenders.has(cleanSenderEmail)) return true;
    const atIndex = cleanSenderEmail.indexOf("@");
    if (atIndex !== -1) {
      const domain = cleanSenderEmail.slice(atIndex);
      if (trustedSenders.has(domain)) return true;
    }
    return false;
  })();

  useEffect(() => {
    setLoadRemoteImages(isSenderTrusted);
  }, [isSenderTrusted, message?.id]);

  const handleAlwaysTrustSender = async () => {
    if (!cleanSenderEmail || trustingSender) return;
    setTrustingSender(true);
    try {
      await api.settings.trustedSenders.add(cleanSenderEmail);
      setTrustedSenders((prev) => new Set(prev).add(cleanSenderEmail));
      setLoadRemoteImages(true);
    } catch (err) {
      console.warn("Failed to add trusted sender:", err);
    } finally {
      setTrustingSender(false);
    }
  };

  useEffect(() => {
    if (id) {
      loadMessage(id);
    }
  }, [id]);

  const loadMessage = async (msgId: string) => {
    try {
      setLoading(true);
      setError(null);
      setWebViewHeight(300);
      setLoadRemoteImages(false);
      const res = await api.messages.get(msgId);
      setMessage(res.message);
      setThread(res.thread || [res.message]);

      // If message is unread, automatically mark as read
      if (!res.message.isRead) {
        api.messages.update(msgId, { isRead: true }).catch(() => {});
      }
    } catch (err: any) {
      console.error("Failed to load message detail:", err);
      setError(err.message || "Failed to load email");
    } finally {
      setLoading(false);
    }
  };

  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<
    string | null
  >(null);

  const handleOpenAttachment = async (att: {
    id: string;
    filename: string;
    contentType: string;
  }) => {
    try {
      setDownloadingAttachmentId(att.id);
      const serverUrl = await getServerUrl();
      const token = await getAuthToken();
      const downloadUrl = `${serverUrl}/api/attachments/${att.id}`;

      if (Platform.OS === "web") {
        window.open(downloadUrl, "_blank");
        return;
      }

      const localUri = `${FileSystem.cacheDirectory}${att.filename}`;

      const res = await FileSystem.downloadAsync(downloadUrl, localUri, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.status === 200) {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(res.uri, {
            mimeType: att.contentType,
            dialogTitle: att.filename,
            UTI: att.contentType,
          });
        } else {
          Alert.alert(
            "Downloaded",
            `Attachment saved to device cache:\n${att.filename}`,
          );
        }
      } else {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
    } catch (err: any) {
      console.error("Failed to open attachment:", err);
      Alert.alert(
        "Attachment Error",
        err.message || "Failed to download attachment.",
      );
    } finally {
      setDownloadingAttachmentId(null);
    }
  };

  const handleToggleStar = async () => {
    if (!message) return;
    const newStarred = !message.isStarred;
    setMessage({ ...message, isStarred: newStarred });
    try {
      await api.messages.update(message.id, { isStarred: newStarred });
    } catch {
      setMessage({ ...message, isStarred: !newStarred });
    }
  };

  const handleToggleRead = async () => {
    if (!message) return;
    const newRead = !message.isRead;
    setMessage({ ...message, isRead: newRead });
    try {
      await api.messages.update(message.id, { isRead: newRead });
    } catch {
      setMessage({ ...message, isRead: !newRead });
    }
  };

  const handleArchive = async () => {
    if (!message) return;
    try {
      setActionLoading(true);
      await api.messages.batch([message.id], "archive");
      router.back();
    } catch (err: any) {
      Alert.alert("Archive Failed", err.message || "Could not archive message");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!message) return;
    Alert.alert(
      "Delete Message",
      "Are you sure you want to move this message to trash?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setActionLoading(true);
              await api.messages.delete(message.id);
              router.back();
            } catch (err: any) {
              Alert.alert(
                "Delete Failed",
                err.message || "Could not delete message",
              );
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
    );
  };

  const handleReply = () => {
    if (!message) return;
    router.push({
      pathname: "/compose",
      params: {
        accountId: message.accountId,
        to: message.fromAddress,
        subject: message.subject?.toLowerCase().startsWith("re:")
          ? message.subject
          : `Re: ${message.subject || ""}`,
        threadId: message.threadId || message.messageId || undefined,
        inReplyTo: message.messageId || undefined,
      },
    });
  };

  const handleReplyAll = () => {
    if (!message) return;
    const allRecipients = [message.fromAddress];
    try {
      if (message.toAddresses) {
        const toList = JSON.parse(message.toAddresses);
        if (Array.isArray(toList)) {
          allRecipients.push(
            ...toList.filter((e) => e !== message.account?.emailAddress),
          );
        }
      }
    } catch {}

    router.push({
      pathname: "/compose",
      params: {
        accountId: message.accountId,
        to: allRecipients.join(", "),
        cc: message.ccAddresses || undefined,
        subject: message.subject?.toLowerCase().startsWith("re:")
          ? message.subject
          : `Re: ${message.subject || ""}`,
        threadId: message.threadId || message.messageId || undefined,
        inReplyTo: message.messageId || undefined,
      },
    });
  };

  const handleForward = () => {
    if (!message) return;
    router.push({
      pathname: "/compose",
      params: {
        accountId: message.accountId,
        subject: message.subject?.toLowerCase().startsWith("fwd:")
          ? message.subject
          : `Fwd: ${message.subject || ""}`,
        bodyText: `\n\n---------- Forwarded message ---------\nFrom: ${message.fromName || ""} <${message.fromAddress}>\nDate: ${message.date}\nSubject: ${message.subject || ""}\n\n${message.bodyText || ""}`,
      },
    });
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), "EEEE, MMM d, yyyy 'at' h:mm a");
    } catch {
      return dateStr;
    }
  };

  // Blocks remote <img> sources (http/https) in an HTML string, preserving
  // the original URL in data-omnimail-src so it can be restored later
  // without re-fetching the message. Mirrors the web app's DOMPurify hook.
  const blockRemoteImages = (html: string): string => {
    return html.replace(
      /<img\b([^>]*?)\ssrc=(["'])(https?:\/\/[^"']+)\2([^>]*)>/gi,
      (_match, pre: string, quote: string, src: string, post: string) => {
        const restAttrs = `${pre}${post}`;
        return `<img${restAttrs} data-omnimail-src="${src}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='28' viewBox='0 0 120 28'%3E%3Crect width='120' height='28' fill='%23f1f5f9' rx='4'/%3E%3Ctext x='60' y='18' font-size='10' font-family='sans-serif' fill='%2394a3b8' text-anchor='middle'%3EImage blocked%3C/text%3E%3C/svg%3E" style="border:1px dashed #cbd5e1;border-radius:4px;">`;
      },
    );
  };

  // Build clean HTML document for WebView
  const getRenderHtml = () => {
    if (!message?.bodyHtml) return null;
    const textColor = isDark ? "#E2E8F0" : "#1E293B";
    const linkColor = isDark ? "#60A5FA" : "#2563EB";
    const bgColor = isDark ? "#111827" : "#FFFFFF";
    const bodyHtml = loadRemoteImages
      ? message.bodyHtml
      : blockRemoteImages(message.bodyHtml);

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              font-size: 15px;
              line-height: 1.55;
              color: ${textColor};
              background-color: ${bgColor};
              margin: 0;
              padding: 16px;
              word-wrap: break-word;
              overflow-wrap: break-word;
            }
            a { color: ${linkColor}; text-decoration: underline; }
            img { max-width: 100% !important; height: auto !important; border-radius: 6px; }
            table { max-width: 100% !important; }
            pre, code { white-space: pre-wrap; font-size: 13px; }
            blockquote { border-left: 3px solid ${isDark ? "#374151" : "#E2E8F0"}; margin-left: 0; padding-left: 12px; color: ${isDark ? "#9CA3AF" : "#64748B"}; }
          </style>
        </head>
        <body>
          ${bodyHtml}
          <script>
            function reportHeight() {
              var h = document.body.scrollHeight;
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(String(h));
              }
            }
            reportHeight();
            window.addEventListener('load', reportHeight);
            // Images / remote content can resize the body after the initial
            // load event fires, so keep reporting for a couple of seconds.
            var reportCount = 0;
            var reportInterval = setInterval(function () {
              reportHeight();
              reportCount += 1;
              if (reportCount > 10) clearInterval(reportInterval);
            }, 300);
            if (window.ResizeObserver) {
              new ResizeObserver(reportHeight).observe(document.body);
            }
          </script>
        </body>
      </html>
    `;
  };

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <View style={styles.topNav}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.navButton}
          >
            <ArrowLeft size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>
            Loading email...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !message) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <View style={styles.topNav}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.navButton}
          >
            <ArrowLeft size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={[styles.errorText, { color: colors.danger }]}>
            {error || "Message not found"}
          </Text>
          <TouchableOpacity
            onPress={() => loadMessage(id!)}
            style={[
              styles.retryBtn,
              { backgroundColor: colors.surfaceHighlight },
            ]}
          >
            <Text style={{ color: colors.primary, fontWeight: "600" }}>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top", "left", "right", "bottom"]}
    >
      {/* Top Nav & Quick Actions */}
      <View style={[styles.topNav, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.navButton}
        >
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.navActions}>
          <TouchableOpacity
            onPress={handleToggleStar}
            style={styles.navActionButton}
          >
            <Star
              size={20}
              color={
                message.isStarred ? colors.starActive : colors.textSecondary
              }
              fill={message.isStarred ? colors.starActive : "transparent"}
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleToggleRead}
            style={styles.navActionButton}
          >
            <Mail size={20} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleArchive}
            style={styles.navActionButton}
          >
            <Archive size={20} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleDelete}
            style={styles.navActionButton}
          >
            <Trash2 size={20} color={colors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scrollArea}>
        {/* Email Metadata Header */}
        <View
          style={[styles.metaSection, { borderBottomColor: colors.border }]}
        >
          <Text style={[styles.subjectTitle, { color: colors.textPrimary }]}>
            {message.subject || "(No Subject)"}
          </Text>

          {/* Account & Folder Badges */}
          <View style={styles.badgeRow}>
            {message.account?.label && (
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: colors.surfaceHighlight,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={[styles.badgeText, { color: colors.textSecondary }]}
                >
                  {message.account.label}
                </Text>
              </View>
            )}
            {message.folder?.name && (
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: colors.surfaceHighlight,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={[styles.badgeText, { color: colors.textSecondary }]}
                >
                  {message.folder.name}
                </Text>
              </View>
            )}
          </View>

          {/* Sender & Recipient Details */}
          <View style={styles.senderRow}>
            <View
              style={[
                styles.avatarCircle,
                { backgroundColor: colors.primaryLight },
              ]}
            >
              <Text style={[styles.avatarText, { color: colors.primary }]}>
                {(message.fromName || message.fromAddress)
                  .charAt(0)
                  .toUpperCase()}
              </Text>
            </View>

            <View style={styles.senderInfo}>
              <Text style={[styles.senderName, { color: colors.textPrimary }]}>
                {message.fromName || message.fromAddress}
              </Text>
              <Text style={[styles.senderEmail, { color: colors.textMuted }]}>
                {message.fromAddress}
              </Text>
              <Text style={[styles.dateFormatted, { color: colors.textMuted }]}>
                {formatDate(message.date)}
              </Text>
            </View>
          </View>
        </View>

        {/* Remote Image Privacy Banner */}
        {message.bodyHtml ? (
          <View
            style={[
              styles.privacyBanner,
              {
                backgroundColor: isSenderTrusted
                  ? colors.primaryLight
                  : colors.warningLight,
              },
            ]}
          >
            <View style={styles.privacyBannerRow}>
              {isSenderTrusted ? (
                <ShieldCheck size={16} color={colors.primary} />
              ) : (
                <Shield size={16} color={colors.warning} />
              )}
              <Text
                style={[
                  styles.privacyBannerText,
                  { color: isSenderTrusted ? colors.primary : colors.warning },
                ]}
              >
                {isSenderTrusted
                  ? `Remote images automatically loaded from trusted sender ${cleanSenderEmail}.`
                  : loadRemoteImages
                    ? "Remote images loaded for this message."
                    : "Remote images are blocked to prevent senders from tracking you."}
              </Text>
            </View>
            {!loadRemoteImages && (
              <View style={styles.privacyBannerActions}>
                <TouchableOpacity
                  onPress={() => setLoadRemoteImages(true)}
                  style={[
                    styles.privacyBannerButton,
                    { backgroundColor: isDark ? "#452E0B" : "#FDE68A" },
                  ]}
                >
                  <Text
                    style={[
                      styles.privacyBannerButtonText,
                      { color: colors.warning },
                    ]}
                  >
                    Load Images
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleAlwaysTrustSender}
                  disabled={trustingSender}
                  style={[
                    styles.privacyBannerButton,
                    { backgroundColor: colors.primaryLight },
                  ]}
                >
                  <ShieldCheck size={12} color={colors.primary} />
                  <Text
                    style={[
                      styles.privacyBannerButtonText,
                      { color: colors.primary },
                    ]}
                  >
                    Always load from this sender
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : null}

        {/* Email Body Rendering */}
        <View style={styles.bodyContainer}>
          {message.bodyHtml ? (
            <View style={styles.webViewWrapper}>
              {Platform.OS === "web" ? (
                <iframe
                  srcDoc={getRenderHtml()!}
                  style={{
                    width: "100%",
                    minHeight: 240,
                    border: "none",
                    backgroundColor: isDark ? "#111827" : "#FFFFFF",
                  }}
                  sandbox="allow-same-origin allow-popups"
                />
              ) : (
                <WebView
                  originWhitelist={["*"]}
                  source={{ html: getRenderHtml()! }}
                  style={[
                    styles.webView,
                    {
                      height: webViewHeight,
                      backgroundColor: isDark ? "#111827" : "#FFFFFF",
                    },
                  ]}
                  scalesPageToFit={false}
                  scrollEnabled={false}
                  onMessage={(event) => {
                    const height = Number(event.nativeEvent.data);
                    if (!Number.isNaN(height) && height > 0) {
                      setWebViewHeight(Math.ceil(height));
                    }
                  }}
                />
              )}
            </View>
          ) : (
            <Text
              selectable
              style={[styles.bodyPlaintext, { color: colors.textPrimary }]}
            >
              {message.bodyText || "(No message body content)"}
            </Text>
          )}
        </View>

        {/* Attachments Section */}
        {message.attachments && message.attachments.length > 0 && (
          <View
            style={[
              styles.attachmentsSection,
              {
                borderTopColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
          >
            <View style={styles.attachmentsHeader}>
              <Paperclip
                size={16}
                color={colors.textSecondary}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[styles.attachmentsTitle, { color: colors.textPrimary }]}
              >
                Attachments ({message.attachments.length})
              </Text>
            </View>

            {message.attachments.map((att) => {
              const isDownloading = downloadingAttachmentId === att.id;
              return (
                <TouchableOpacity
                  key={att.id}
                  disabled={isDownloading}
                  onPress={() => handleOpenAttachment(att)}
                  style={[
                    styles.attachmentItem,
                    {
                      backgroundColor: colors.surfaceHighlight,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <FileText
                    size={18}
                    color={colors.primary}
                    style={{ marginRight: 10 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.attachmentFilename,
                        { color: colors.textPrimary },
                      ]}
                    >
                      {att.filename}
                    </Text>
                    <Text
                      style={[
                        styles.attachmentMeta,
                        { color: colors.textMuted },
                      ]}
                    >
                      {att.size < 1024
                        ? `${att.size} B`
                        : att.size < 1024 * 1024
                          ? `${Math.round(att.size / 1024)} KB`
                          : `${(att.size / (1024 * 1024)).toFixed(1)} MB`}{" "}
                      · {att.contentType}
                    </Text>
                  </View>
                  <View style={styles.downloadIconBtn}>
                    {isDownloading ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Download size={16} color={colors.textSecondary} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Bottom Action Bar */}
      <View
        style={[
          styles.bottomActionBar,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={handleReply}
          style={[
            styles.bottomActionBtn,
            { backgroundColor: colors.surfaceHighlight },
          ]}
        >
          <Reply
            size={18}
            color={colors.textPrimary}
            style={{ marginRight: 6 }}
          />
          <Text
            style={[styles.bottomActionText, { color: colors.textPrimary }]}
          >
            Reply
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleReplyAll}
          style={[
            styles.bottomActionBtn,
            { backgroundColor: colors.surfaceHighlight },
          ]}
        >
          <ReplyAll
            size={18}
            color={colors.textPrimary}
            style={{ marginRight: 6 }}
          />
          <Text
            style={[styles.bottomActionText, { color: colors.textPrimary }]}
          >
            Reply All
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleForward}
          style={[
            styles.bottomActionBtn,
            { backgroundColor: colors.surfaceHighlight },
          ]}
        >
          <Forward
            size={18}
            color={colors.textPrimary}
            style={{ marginRight: 6 }}
          />
          <Text
            style={[styles.bottomActionText, { color: colors.textPrimary }]}
          >
            Forward
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navButton: {
    padding: Spacing.sm,
  },
  navActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  navActionButton: {
    padding: Spacing.sm,
    marginLeft: 6,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: Typography.sizes.sm,
  },
  errorText: {
    fontSize: Typography.sizes.base,
    marginBottom: Spacing.md,
  },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  scrollArea: {
    flex: 1,
  },
  metaSection: {
    padding: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  subjectTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    lineHeight: 26,
    marginBottom: Spacing.sm,
  },
  badgeRow: {
    flexDirection: "row",
    marginBottom: Spacing.md,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    marginRight: 6,
  },
  badgeText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.medium,
  },
  senderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  avatarText: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
  },
  senderInfo: {
    flex: 1,
  },
  senderName: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  senderEmail: {
    fontSize: Typography.sizes.xs,
    marginTop: 1,
  },
  dateFormatted: {
    fontSize: Typography.sizes.xs,
    marginTop: 2,
  },
  bodyContainer: {
    padding: Spacing.lg,
    minHeight: 240,
  },
  privacyBanner: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    borderRadius: 10,
    padding: Spacing.sm,
  },
  privacyBannerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  privacyBannerText: {
    flex: 1,
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.medium,
  },
  privacyBannerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  privacyBannerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  privacyBannerButtonText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  webViewWrapper: {
    minHeight: 300,
    width: "100%",
  },
  webView: {
    minHeight: 300,
    width: "100%",
  },
  bodyPlaintext: {
    fontSize: Typography.sizes.base,
    lineHeight: 22,
  },
  attachmentsSection: {
    padding: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  attachmentsHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  attachmentsTitle: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  attachmentItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  attachmentFilename: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
  },
  attachmentMeta: {
    fontSize: Typography.sizes.xs,
    marginTop: 2,
  },
  downloadIconBtn: {
    padding: 6,
    marginLeft: 6,
  },
  bottomActionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  bottomActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 4,
  },
  bottomActionText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
});
