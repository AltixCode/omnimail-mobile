import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { WebView } from "react-native-webview";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import {
  X,
  Send,
  ChevronDown,
  ChevronRight,
  Check,
  Paperclip,
  FileText,
  Trash2,
  Bold,
  Italic,
  Underline,
  List,
  Clock,
  Calendar,
  Search,
  AlertCircle,
} from "lucide-react-native";
import { useTheme } from "../src/context/ThemeContext";
import { api } from "../src/services/api";
import { MailAccount } from "../src/types";
import { Spacing, Typography } from "../src/constants/theme";
import {
  COMMON_TIMEZONES,
  getDeviceTimezone,
  wallTimeToUTC,
  getWallClockInTimezone,
  getMobileSchedulePresets,
} from "../src/services/timezone";

function plainTextToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(/\n/g, "<br>");
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatScheduledDisplay(isoString: string, timeZone: string): string {
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    return isoString;
  }
}

interface LocalAttachment {
  name: string;
  size: number;
  uri?: string;
  mimeType: string;
  dataBase64?: string;
}

export default function ComposeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    accountId?: string;
    to?: string;
    cc?: string;
    subject?: string;
    bodyText?: string;
    inReplyTo?: string;
    references?: string;
    threadId?: string;
    scheduledId?: string;
  }>();

  const isScheduledEdit = Boolean(params.scheduledId);
  const cleanScheduledId = params.scheduledId
    ? params.scheduledId.replace(/^sched_/, "")
    : "";

  const { colors, isDark } = useTheme();

  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    params.accountId || "",
  );
  const [showCc, setShowCc] = useState<boolean>(Boolean(params.cc));
  const [to, setTo] = useState<string>(params.to || "");
  const [cc, setCc] = useState<string>(params.cc || "");
  const [subject, setSubject] = useState<string>(params.subject || "");

  // Timezone and scheduling state
  const [effectiveTimezone, setEffectiveTimezone] = useState<string>(getDeviceTimezone());
  const [scheduleTimezone, setScheduleTimezone] = useState<string>(getDeviceTimezone());
  const [scheduleModalVisible, setScheduleModalVisible] = useState<boolean>(false);
  const [scheduleTzModalVisible, setScheduleTzModalVisible] = useState<boolean>(false);
  const [tzSearchQuery, setTzSearchQuery] = useState<string>("");
  const [selectedScheduleDate, setSelectedScheduleDate] = useState<string>("");
  const [selectedScheduleTime, setSelectedScheduleTime] = useState<string>("08:00");
  const [originalScheduledAt, setOriginalScheduledAt] = useState<string | null>(null);
  const [loadingScheduled, setLoadingScheduled] = useState<boolean>(false);

  // Rich text body editor
  const webviewRef = useRef<WebView>(null);
  const initialEditorHtmlRef = useRef<string>(
    params.bodyText ? plainTextToHtml(params.bodyText) : "",
  );
  const [editorHtml, setEditorHtml] = useState<string>(
    initialEditorHtmlRef.current,
  );
  const [editorHeight, setEditorHeight] = useState<number>(250);

  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [accountModalVisible, setAccountModalVisible] = useState(false);

  const runEditorCommand = (command: string) => {
    webviewRef.current?.injectJavaScript(
      `document.execCommand('${command}'); true;`,
    );
  };

  const [composeHtmlSource] = useState(() => {
    const textColor = isDark ? "#E2E8F0" : "#1E293B";
    const bgColor = isDark ? "#111827" : "#FFFFFF";
    const placeholderColor = isDark ? "#64748B" : "#94A3B8";
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
          <style>
            html, body { margin: 0; padding: 0; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              font-size: 15px;
              line-height: 1.55;
              color: ${textColor};
              background-color: ${bgColor};
              padding: 16px;
              word-wrap: break-word;
              overflow-wrap: break-word;
            }
            #editor { min-height: 200px; outline: none; }
            #editor:empty:before {
              content: attr(data-placeholder);
              color: ${placeholderColor};
            }
            ul, ol { padding-left: 20px; }
          </style>
        </head>
        <body>
          <div id="editor" contenteditable="true" data-placeholder="Compose email..."></div>
          <script>
            var editor = document.getElementById('editor');
            editor.innerHTML = ${JSON.stringify(initialEditorHtmlRef.current)};

            function post(type, payload) {
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, payload: payload }));
              }
            }
            function reportHeight() {
              post('height', document.body.scrollHeight);
            }
            function reportContent() {
              post('content', editor.innerHTML);
            }

            editor.addEventListener('input', function () {
              reportContent();
              reportHeight();
            });

            reportHeight();
            window.addEventListener('load', reportHeight);
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
  });

  // Load accounts and timezone preferences
  useEffect(() => {
    loadAccounts();
    loadTimezonePreference();
  }, []);

  // If editing an existing scheduled email, fetch full details
  useEffect(() => {
    if (params.scheduledId) {
      loadScheduledEmail(params.scheduledId);
    }
  }, [params.scheduledId]);

  const loadAccounts = async () => {
    try {
      const res = await api.accounts.list();
      setAccounts(res.accounts || []);
      if (!selectedAccountId && res.accounts.length > 0) {
        setSelectedAccountId(res.accounts[0].id);
      }
    } catch (err) {
      console.warn("Failed to load accounts for composer:", err);
    }
  };

  const loadTimezonePreference = async () => {
    try {
      const pref = await api.settings.timezone.get();
      if (pref.timezoneMode === "manual" && pref.timezone) {
        setEffectiveTimezone(pref.timezone);
        setScheduleTimezone(pref.timezone);
      } else {
        const devTz = getDeviceTimezone();
        setEffectiveTimezone(devTz);
        setScheduleTimezone(devTz);
      }
    } catch (err) {
      const devTz = getDeviceTimezone();
      setEffectiveTimezone(devTz);
      setScheduleTimezone(devTz);
    }
  };

  const loadScheduledEmail = async (id: string) => {
    try {
      setLoadingScheduled(true);
      const cleanId = id.replace(/^sched_/, "");
      const res = await api.messages.scheduled.get(cleanId);
      const msg = res.message;
      if (msg) {
        if (msg.accountId) setSelectedAccountId(msg.accountId);

        let toStr = "";
        try {
          const parsed = JSON.parse(msg.toAddresses || "[]");
          toStr = Array.isArray(parsed) ? parsed.join(", ") : String(parsed);
        } catch {
          toStr = msg.toAddresses || "";
        }
        setTo(toStr);

        let ccStr = "";
        if (msg.ccAddresses) {
          try {
            const parsed = JSON.parse(msg.ccAddresses);
            ccStr = Array.isArray(parsed) ? parsed.join(", ") : String(parsed);
          } catch {
            ccStr = msg.ccAddresses;
          }
        }
        setCc(ccStr);
        if (ccStr) setShowCc(true);

        setSubject(msg.subject || "");

        const bodyHtmlContent =
          msg.bodyHtml || (msg.bodyText ? plainTextToHtml(msg.bodyText) : "");
        setEditorHtml(bodyHtmlContent);
        initialEditorHtmlRef.current = bodyHtmlContent;

        // Inject into WebView DOM if already mounted
        webviewRef.current?.injectJavaScript(`
          if (document.getElementById('editor')) {
            document.getElementById('editor').innerHTML = ${JSON.stringify(bodyHtmlContent)};
          }
          true;
        `);

        if (msg.scheduledAt) {
          setOriginalScheduledAt(msg.scheduledAt);
          const scheduledDate = new Date(msg.scheduledAt);
          const tz = msg.timezone || effectiveTimezone;
          setScheduleTimezone(tz);
          const wall = getWallClockInTimezone(scheduledDate, tz);
          setSelectedScheduleDate(
            `${wall.year}-${String(wall.month).padStart(2, "0")}-${String(wall.day).padStart(2, "0")}`,
          );
          setSelectedScheduleTime(
            `${String(wall.hour).padStart(2, "0")}:${String(wall.minute).padStart(2, "0")}`,
          );
        }

        if (msg.attachments && Array.isArray(msg.attachments)) {
          setAttachments(
            msg.attachments.map((att: any) => ({
              name: att.filename,
              size: att.size || 0,
              mimeType: att.contentType || "application/octet-stream",
              dataBase64: att.dataBase64,
            })),
          );
        }
      }
    } catch (err: any) {
      console.error("Failed to load scheduled email:", err);
      Alert.alert("Error", err.message || "Failed to load scheduled email.");
    } finally {
      setLoadingScheduled(false);
    }
  };

  // Compute preset dates based on scheduleTimezone
  const schedulePresets = useMemo(() => {
    return getMobileSchedulePresets(new Date(), scheduleTimezone);
  }, [scheduleTimezone]);

  // Ensure default custom date is tomorrow in scheduleTimezone
  useEffect(() => {
    if (!selectedScheduleDate) {
      const wall = getWallClockInTimezone(new Date(), scheduleTimezone);
      const base = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + 1, 12, 0, 0));
      setSelectedScheduleDate(
        `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(base.getUTCDate()).padStart(2, "0")}`,
      );
    }
  }, [scheduleTimezone, selectedScheduleDate]);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const totalAttachmentsSize = attachments.reduce((sum, a) => sum + a.size, 0);

  const handlePickAttachment = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newItems: LocalAttachment[] = result.assets.map((asset) => ({
          name: asset.name,
          size: asset.size || 0,
          uri: asset.uri,
          mimeType: asset.mimeType || "application/octet-stream",
        }));

        const MAX_TOTAL_SIZE = 25 * 1024 * 1024;
        const currentSum = attachments.reduce((sum, a) => sum + a.size, 0);
        const incomingSum = newItems.reduce((sum, a) => sum + a.size, 0);

        if (currentSum + incomingSum > MAX_TOTAL_SIZE) {
          Alert.alert(
            "Attachment Size Exceeded",
            "Total attachment size cannot exceed 25 MB. Please select smaller files.",
          );
          return;
        }

        setAttachments((prev) => [...prev, ...newItems]);
      }
    } catch (err: any) {
      console.warn("Error picking document:", err);
      Alert.alert("Attachment Error", err.message || "Failed to attach file.");
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const getEncodedAttachments = async () => {
    if (attachments.length === 0) return undefined;
    return await Promise.all(
      attachments.map(async (att) => {
        let base64Data = att.dataBase64 || "";
        if (!base64Data && att.uri) {
          if (Platform.OS === "web") {
            const fetchRes = await fetch(att.uri);
            const blob = await fetchRes.blob();
            base64Data = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const resStr = (reader.result as string) || "";
                const commaIdx = resStr.indexOf(",");
                resolve(commaIdx !== -1 ? resStr.slice(commaIdx + 1) : resStr);
              };
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } else {
            base64Data = await FileSystem.readAsStringAsync(att.uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
          }
        }
        return {
          filename: att.name,
          content: base64Data,
          contentType: att.mimeType,
          size: att.size,
        };
      }),
    );
  };

  const validateEmailFields = (): boolean => {
    if (!selectedAccountId) {
      Alert.alert("Missing Account", "Please select an account to send from.");
      return false;
    }
    if (!to.trim()) {
      Alert.alert(
        "Missing Recipient",
        "Please enter at least one recipient email address in 'To'.",
      );
      return false;
    }
    if (!subject.trim()) {
      Alert.alert("Missing Subject", "Please provide a subject line.");
      return false;
    }
    return true;
  };

  const handleSend = async () => {
    if (!validateEmailFields()) return;

    try {
      setSending(true);
      const encodedAttachments = await getEncodedAttachments();

      await api.messages.send({
        accountId: selectedAccountId,
        to: to.trim(),
        cc: cc.trim() || undefined,
        subject: subject.trim(),
        bodyText: htmlToPlainText(editorHtml),
        bodyHtml: editorHtml,
        inReplyTo: params.inReplyTo,
        references: params.references,
        threadId: params.threadId,
        attachments: encodedAttachments,
      });

      if (Platform.OS === "web") {
        window.alert("Your email has been sent successfully.");
        router.back();
      } else {
        Alert.alert("Sent", "Your email has been sent successfully.", [
          { text: "OK", onPress: () => router.back() },
        ]);
      }
    } catch (err: any) {
      console.error("Send error:", err);
      Alert.alert(
        "Send Failed",
        err.message ||
          "Failed to dispatch email. Please check your credentials.",
      );
    } finally {
      setSending(false);
    }
  };

  const parseScheduleTargetUTC = (
    dateStr: string,
    timeStr: string,
    tz: string,
  ): Date | null => {
    const parts = dateStr.trim().split("-");
    const timeParts = timeStr.trim().split(":");
    if (parts.length !== 3 || timeParts.length < 2) return null;

    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    const h = parseInt(timeParts[0], 10);
    const min = parseInt(timeParts[1], 10);

    if (isNaN(y) || isNaN(m) || isNaN(d) || isNaN(h) || isNaN(min)) {
      return null;
    }
    return wallTimeToUTC(y, m, d, h, min, 0, tz);
  };

  const handleConfirmSchedule = async (targetDate?: Date) => {
    if (!validateEmailFields()) return;

    let finalTargetDate: Date;
    if (targetDate) {
      finalTargetDate = targetDate;
    } else {
      const parsed = parseScheduleTargetUTC(
        selectedScheduleDate,
        selectedScheduleTime,
        scheduleTimezone,
      );
      if (!parsed) {
        Alert.alert(
          "Invalid Date or Time",
          "Please enter a valid date (YYYY-MM-DD) and time (HH:MM).",
        );
        return;
      }
      finalTargetDate = parsed;
    }

    if (finalTargetDate.getTime() <= Date.now() + 30 * 1000) {
      Alert.alert(
        "Scheduled Time in the Past",
        "The scheduled time must be at least 1 minute in the future.",
      );
      return;
    }

    try {
      setSending(true);
      const encodedAttachments = await getEncodedAttachments();
      const scheduledAtISO = finalTargetDate.toISOString();

      const formattedTime = new Intl.DateTimeFormat("en-US", {
        timeZone: scheduleTimezone,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(finalTargetDate);

      if (isScheduledEdit && cleanScheduledId) {
        await api.messages.scheduled.update(cleanScheduledId, {
          accountId: selectedAccountId,
          to: to.trim(),
          cc: cc.trim() || undefined,
          subject: subject.trim(),
          bodyText: htmlToPlainText(editorHtml),
          bodyHtml: editorHtml,
          scheduledAt: scheduledAtISO,
          timezone: scheduleTimezone,
          attachments: encodedAttachments,
        });

        setScheduleModalVisible(false);
        Alert.alert(
          "Schedule Updated",
          `Your email will be sent on ${formattedTime} (${scheduleTimezone}).`,
          [{ text: "OK", onPress: () => router.back() }],
        );
      } else {
        await api.messages.send({
          accountId: selectedAccountId,
          to: to.trim(),
          cc: cc.trim() || undefined,
          subject: subject.trim(),
          bodyText: htmlToPlainText(editorHtml),
          bodyHtml: editorHtml,
          inReplyTo: params.inReplyTo,
          references: params.references,
          threadId: params.threadId,
          scheduledAt: scheduledAtISO,
          timezone: scheduleTimezone,
          attachments: encodedAttachments,
        });

        setScheduleModalVisible(false);
        Alert.alert(
          "Email Scheduled",
          `Your email will be sent on ${formattedTime} (${scheduleTimezone}).`,
          [{ text: "OK", onPress: () => router.back() }],
        );
      }
    } catch (err: any) {
      console.error("Schedule error:", err);
      Alert.alert(
        "Schedule Failed",
        err.message || "Failed to schedule email.",
      );
    } finally {
      setSending(false);
    }
  };

  const handleUpdateScheduledEmail = async () => {
    if (!validateEmailFields()) return;

    let targetDate: Date | null = null;
    if (originalScheduledAt) {
      targetDate = new Date(originalScheduledAt);
      if (targetDate.getTime() <= Date.now() + 30 * 1000) {
        setScheduleModalVisible(true);
        return;
      }
    } else {
      targetDate = parseScheduleTargetUTC(
        selectedScheduleDate,
        selectedScheduleTime,
        scheduleTimezone,
      );
    }

    if (!targetDate || targetDate.getTime() <= Date.now() + 30 * 1000) {
      setScheduleModalVisible(true);
      return;
    }

    handleConfirmSchedule(targetDate);
  };

  const handleSendNow = () => {
    if (!cleanScheduledId) return;
    Alert.alert("Send Now", "Send this scheduled email immediately now?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Send Now",
        onPress: async () => {
          try {
            setSending(true);
            const encodedAttachments = await getEncodedAttachments();
            await api.messages.scheduled.update(cleanScheduledId, {
              accountId: selectedAccountId,
              to: to.trim(),
              cc: cc.trim() || undefined,
              subject: subject.trim(),
              bodyText: htmlToPlainText(editorHtml),
              bodyHtml: editorHtml,
              attachments: encodedAttachments,
            });
            await api.messages.scheduled.sendNow(cleanScheduledId);
            Alert.alert("Sent", "Your email has been sent successfully.", [
              { text: "OK", onPress: () => router.back() },
            ]);
          } catch (err: any) {
            Alert.alert(
              "Send Failed",
              err.message || "Failed to send email now.",
            );
          } finally {
            setSending(false);
          }
        },
      },
    ]);
  };

  const handleCancelScheduled = () => {
    if (!cleanScheduledId) return;
    Alert.alert(
      "Cancel Scheduled Email",
      "Are you sure you want to cancel and delete this scheduled email?",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Cancel Send",
          style: "destructive",
          onPress: async () => {
            try {
              setSending(true);
              await api.messages.scheduled.delete(cleanScheduledId);
              Alert.alert("Cancelled", "Scheduled email has been cancelled.", [
                { text: "OK", onPress: () => router.back() },
              ]);
            } catch (err: any) {
              Alert.alert(
                "Error",
                err.message || "Failed to cancel scheduled email.",
              );
            } finally {
              setSending(false);
            }
          },
        },
      ],
    );
  };

  const setQuickDateOffset = (offsetDays: number) => {
    const wall = getWallClockInTimezone(new Date(), scheduleTimezone);
    const d = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + offsetDays, 12, 0, 0));
    setSelectedScheduleDate(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
    );
  };

  const setQuickNextMonday = () => {
    const wall = getWallClockInTimezone(new Date(), scheduleTimezone);
    const currentUtcDay = new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay();
    let daysUntilMonday = (1 - currentUtcDay + 7) % 7;
    if (daysUntilMonday <= 0) daysUntilMonday += 7;
    setQuickDateOffset(daysUntilMonday);
  };

  const filteredTimezones = useMemo(() => {
    const q = tzSearchQuery.trim().toLowerCase();
    if (!q) return COMMON_TIMEZONES;
    return COMMON_TIMEZONES.filter((tz) =>
      tz.toLowerCase().includes(q) || tz.replace(/_/g, " ").toLowerCase().includes(q),
    );
  }, [tzSearchQuery]);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      {/* Top Header */}
      <View style={[styles.topHeader, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.closeButton}
          disabled={sending}
        >
          <X size={24} color={colors.textPrimary} />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          {isScheduledEdit ? "Edit Scheduled" : "New Message"}
        </Text>

        <View style={styles.headerRightActions}>
          <TouchableOpacity
            onPress={handlePickAttachment}
            disabled={sending}
            style={[
              styles.attachButton,
              { backgroundColor: colors.surfaceHighlight },
            ]}
          >
            <Paperclip size={18} color={colors.textPrimary} />
            {attachments.length > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                <Text style={styles.badgeText}>{attachments.length}</Text>
              </View>
            )}
          </TouchableOpacity>

          {isScheduledEdit ? (
            <>
              {/* Send Now Icon Button */}
              <TouchableOpacity
                onPress={handleSendNow}
                disabled={sending}
                style={[
                  styles.attachButton,
                  { backgroundColor: colors.surfaceHighlight },
                ]}
              >
                <Send size={16} color={colors.textPrimary} />
              </TouchableOpacity>

              {/* Update Schedule Button */}
              <TouchableOpacity
                onPress={handleUpdateScheduledEmail}
                disabled={sending}
                style={[
                  styles.sendButton,
                  {
                    backgroundColor: colors.primary,
                    opacity: sending ? 0.7 : 1,
                  },
                ]}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Clock size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.sendButtonText}>Update</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* Schedule Send Modal Opener */}
              <TouchableOpacity
                onPress={() => setScheduleModalVisible(true)}
                disabled={sending}
                style={[
                  styles.attachButton,
                  { backgroundColor: colors.surfaceHighlight },
                ]}
              >
                <Clock size={18} color={colors.textPrimary} />
              </TouchableOpacity>

              {/* Immediate Send Button */}
              <TouchableOpacity
                onPress={handleSend}
                disabled={sending}
                style={[
                  styles.sendButton,
                  {
                    backgroundColor: colors.primary,
                    opacity: sending ? 0.7 : 1,
                  },
                ]}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Send size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.sendButtonText}>Send</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Scheduled Info Banner (if editing scheduled email) */}
      {isScheduledEdit && (
        <View
          style={[
            styles.scheduledBanner,
            {
              backgroundColor: isDark
                ? "rgba(245, 158, 11, 0.15)"
                : "#FEF3C7",
              borderBottomColor: isDark
                ? "rgba(245, 158, 11, 0.3)"
                : "#FDE68A",
            },
          ]}
        >
          <Clock
            size={16}
            color={isDark ? "#FBBF24" : "#D97706"}
            style={{ marginRight: 8 }}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.scheduledBannerTitle,
                { color: isDark ? "#FCD34D" : "#92400E" },
              ]}
            >
              Scheduled:{" "}
              {originalScheduledAt
                ? formatScheduledDisplay(originalScheduledAt, scheduleTimezone)
                : `${selectedScheduleDate} ${selectedScheduleTime}`}
            </Text>
            <Text
              style={[
                styles.scheduledBannerSub,
                { color: isDark ? "#FBBF24" : "#B45309" },
              ]}
            >
              Timezone: {scheduleTimezone}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setScheduleModalVisible(true)}
            style={[
              styles.bannerActionBtn,
              {
                backgroundColor: isDark
                  ? "rgba(245, 158, 11, 0.25)"
                  : "#FDE68A",
              },
            ]}
          >
            <Text
              style={[
                styles.bannerActionText,
                { color: isDark ? "#FDE68A" : "#78350F" },
              ]}
            >
              Change
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {loadingScheduled ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Loading scheduled email...
          </Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView
            style={styles.formScroll}
            keyboardShouldPersistTaps="handled"
          >
            {/* From Account Selector */}
            <TouchableOpacity
              style={[styles.fieldRow, { borderBottomColor: colors.border }]}
              onPress={() => setAccountModalVisible(true)}
            >
              <Text
                style={[styles.fieldLabel, { color: colors.textSecondary }]}
              >
                From:
              </Text>
              <View style={styles.fromAccountWrapper}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.fromAccountText,
                    { color: colors.textPrimary },
                  ]}
                >
                  {selectedAccount
                    ? `${selectedAccount.label} <${selectedAccount.emailAddress}>`
                    : "Select sending account..."}
                </Text>
                <ChevronDown
                  size={16}
                  color={colors.textSecondary}
                  style={{ marginLeft: 6 }}
                />
              </View>
            </TouchableOpacity>

            {/* To Field */}
            <View
              style={[styles.fieldRow, { borderBottomColor: colors.border }]}
            >
              <Text
                style={[styles.fieldLabel, { color: colors.textSecondary }]}
              >
                To:
              </Text>
              <TextInput
                style={[styles.fieldInput, { color: colors.textPrimary }]}
                placeholder="recipient@example.com"
                placeholderTextColor={colors.textMuted}
                value={to}
                onChangeText={setTo}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {!showCc && (
                <TouchableOpacity
                  onPress={() => setShowCc(true)}
                  style={styles.ccToggle}
                >
                  <Text style={[styles.ccToggleText, { color: colors.primary }]}>
                    Cc
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Cc Field (Optional) */}
            {showCc && (
              <View
                style={[styles.fieldRow, { borderBottomColor: colors.border }]}
              >
                <Text
                  style={[styles.fieldLabel, { color: colors.textSecondary }]}
                >
                  Cc:
                </Text>
                <TextInput
                  style={[styles.fieldInput, { color: colors.textPrimary }]}
                  placeholder="colleague@example.com"
                  placeholderTextColor={colors.textMuted}
                  value={cc}
                  onChangeText={setCc}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            )}

            {/* Subject Field */}
            <View
              style={[styles.fieldRow, { borderBottomColor: colors.border }]}
            >
              <Text
                style={[styles.fieldLabel, { color: colors.textSecondary }]}
              >
                Subject:
              </Text>
              <TextInput
                style={[
                  styles.fieldInput,
                  {
                    color: colors.textPrimary,
                    fontWeight: Typography.weights.medium,
                  },
                ]}
                placeholder="Subject"
                placeholderTextColor={colors.textMuted}
                value={subject}
                onChangeText={setSubject}
              />
            </View>

            {/* Attachments Section */}
            {attachments.length > 0 && (
              <View
                style={[
                  styles.attachmentsContainer,
                  {
                    backgroundColor: colors.surfaceHighlight,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <View style={styles.attachmentsTopRow}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Paperclip
                      size={14}
                      color={colors.textSecondary}
                      style={{ marginRight: 4 }}
                    />
                    <Text
                      style={[
                        styles.attachmentsLabel,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Attachments ({attachments.length}) ·{" "}
                      {formatFileSize(totalAttachmentsSize)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={handlePickAttachment}
                    style={styles.addMoreBtn}
                  >
                    <Text
                      style={[styles.addMoreText, { color: colors.primary }]}
                    >
                      + Add more
                    </Text>
                  </TouchableOpacity>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.attachmentsList}
                >
                  {attachments.map((att, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.attachmentChip,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <FileText
                        size={14}
                        color={colors.primary}
                        style={{ marginRight: 6 }}
                      />
                      <View style={{ maxWidth: 120 }}>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.attachmentChipName,
                            { color: colors.textPrimary },
                          ]}
                        >
                          {att.name}
                        </Text>
                        <Text
                          style={[
                            styles.attachmentChipSize,
                            { color: colors.textMuted },
                          ]}
                        >
                          {formatFileSize(att.size)}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleRemoveAttachment(idx)}
                        style={styles.removeAttachmentBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <X size={14} color={colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Rich Text Toolbar */}
            <View
              style={[styles.rtToolbar, { borderBottomColor: colors.border }]}
            >
              <TouchableOpacity
                onPress={() => runEditorCommand("bold")}
                style={styles.rtToolbarButton}
              >
                <Bold size={17} color={colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => runEditorCommand("italic")}
                style={styles.rtToolbarButton}
              >
                <Italic size={17} color={colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => runEditorCommand("underline")}
                style={styles.rtToolbarButton}
              >
                <Underline size={17} color={colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => runEditorCommand("insertUnorderedList")}
                style={styles.rtToolbarButton}
              >
                <List size={17} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Body Rich Text Editor */}
            {Platform.OS === "web" ? (
              <iframe
                srcDoc={composeHtmlSource}
                style={{
                  width: "100%",
                  minHeight: 250,
                  border: "none",
                  backgroundColor: isDark ? "#111827" : "#FFFFFF",
                }}
              />
            ) : (
              <WebView
                ref={webviewRef}
                originWhitelist={["*"]}
                source={{ html: composeHtmlSource }}
                style={[
                  styles.rtWebView,
                  {
                    height: editorHeight,
                    backgroundColor: isDark ? "#111827" : "#FFFFFF",
                  },
                ]}
                scalesPageToFit={false}
                hideKeyboardAccessoryView
                onLoadEnd={() => {
                  if (editorHtml) {
                    webviewRef.current?.injectJavaScript(`
                      var editor = document.getElementById('editor');
                      if (editor && !editor.innerHTML) {
                        editor.innerHTML = ${JSON.stringify(editorHtml)};
                      }
                      true;
                    `);
                  }
                }}
                onMessage={(event) => {
                  try {
                    const msg = JSON.parse(event.nativeEvent.data);
                    if (
                      msg.type === "height" &&
                      typeof msg.payload === "number"
                    ) {
                      setEditorHeight(Math.max(200, Math.ceil(msg.payload)));
                    } else if (msg.type === "content") {
                      setEditorHtml(msg.payload);
                    }
                  } catch {}
                }}
              />
            )}

            {/* Bottom Action for Scheduled Email: Cancel Send */}
            {isScheduledEdit && (
              <View style={styles.cancelSendContainer}>
                <TouchableOpacity
                  onPress={handleCancelScheduled}
                  style={[
                    styles.cancelSendBtn,
                    { borderColor: isDark ? "#EF4444" : "#DC2626" },
                  ]}
                >
                  <Trash2
                    size={16}
                    color={isDark ? "#EF4444" : "#DC2626"}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.cancelSendText,
                      { color: isDark ? "#EF4444" : "#DC2626" },
                    ]}
                  >
                    Cancel Scheduled Send
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* Account Picker Modal */}
      <Modal
        visible={accountModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAccountModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setAccountModalVisible(false)}
        >
          <View
            style={[
              styles.modalContent,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              Send From Account
            </Text>
            <ScrollView>
              {accounts.map((acc) => (
                <TouchableOpacity
                  key={acc.id}
                  style={[
                    styles.modalItem,
                    {
                      backgroundColor:
                        selectedAccountId === acc.id
                          ? colors.surfaceHighlight
                          : "transparent",
                    },
                  ]}
                  onPress={() => {
                    setSelectedAccountId(acc.id);
                    setAccountModalVisible(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.modalItemText,
                        { color: colors.textPrimary },
                      ]}
                    >
                      {acc.label}
                    </Text>
                    <Text
                      style={[
                        styles.modalItemSubtext,
                        { color: colors.textMuted },
                      ]}
                    >
                      {acc.emailAddress}
                    </Text>
                  </View>
                  {selectedAccountId === acc.id && (
                    <Check size={18} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Schedule Send Modal (Gmail style) */}
      <Modal
        visible={scheduleModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setScheduleModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.scheduleModalContent,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            {/* Modal Header */}
            <View style={styles.scheduleModalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Clock
                  size={20}
                  color={colors.primary}
                  style={{ marginRight: 8 }}
                />
                <Text
                  style={[
                    styles.modalTitle,
                    { color: colors.textPrimary, marginBottom: 0 },
                  ]}
                >
                  {isScheduledEdit ? "Reschedule Send" : "Schedule Send"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setScheduleModalVisible(false)}
                style={{ padding: 4 }}
              >
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Timezone Indicator & Selector */}
              <TouchableOpacity
                onPress={() => setScheduleTzModalVisible(true)}
                style={[
                  styles.tzSelectorRow,
                  {
                    backgroundColor: colors.surfaceHighlight,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.tzSelectorLabel,
                      { color: colors.textMuted },
                    ]}
                  >
                    Sending Timezone
                  </Text>
                  <Text
                    style={[
                      styles.tzSelectorValue,
                      { color: colors.textPrimary },
                    ]}
                  >
                    {scheduleTimezone}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text
                    style={[
                      styles.tzChangeButtonText,
                      { color: colors.primary },
                    ]}
                  >
                    Change
                  </Text>
                  <ChevronRight
                    size={16}
                    color={colors.primary}
                    style={{ marginLeft: 4 }}
                  />
                </View>
              </TouchableOpacity>

              {/* Quick Presets */}
              <Text
                style={[
                  styles.scheduleSectionTitle,
                  { color: colors.textSecondary },
                ]}
              >
                QUICK PRESETS
              </Text>
              <View style={styles.presetsList}>
                {schedulePresets.map((preset) => (
                  <TouchableOpacity
                    key={preset.id}
                    onPress={() => handleConfirmSchedule(preset.date)}
                    style={[
                      styles.presetItem,
                      {
                        backgroundColor: colors.surfaceHighlight,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.presetLabel,
                          { color: colors.textPrimary },
                        ]}
                      >
                        {preset.label}
                      </Text>
                      <Text
                        style={[
                          styles.presetDisplayTime,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {preset.displayTime}
                      </Text>
                    </View>
                    <ChevronRight size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                ))}
              </View>

              {/* Custom Date & Time Picker */}
              <Text
                style={[
                  styles.scheduleSectionTitle,
                  { color: colors.textSecondary, marginTop: Spacing.md },
                ]}
              >
                CUSTOM DATE & TIME
              </Text>

              {/* Quick Date Pills */}
              <View style={styles.quickPillsRow}>
                <TouchableOpacity
                  onPress={() => setQuickDateOffset(1)}
                  style={[
                    styles.quickPill,
                    {
                      backgroundColor: colors.surfaceHighlight,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.quickPillText,
                      { color: colors.textPrimary },
                    ]}
                  >
                    Tomorrow
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setQuickDateOffset(2)}
                  style={[
                    styles.quickPill,
                    {
                      backgroundColor: colors.surfaceHighlight,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.quickPillText,
                      { color: colors.textPrimary },
                    ]}
                  >
                    +2 Days
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={setQuickNextMonday}
                  style={[
                    styles.quickPill,
                    {
                      backgroundColor: colors.surfaceHighlight,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.quickPillText,
                      { color: colors.textPrimary },
                    ]}
                  >
                    Next Mon
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Date Input */}
              <View style={styles.inputFieldBlock}>
                <Text
                  style={[styles.inputFieldLabel, { color: colors.textSecondary }]}
                >
                  Date (YYYY-MM-DD)
                </Text>
                <TextInput
                  style={[
                    styles.customInput,
                    {
                      backgroundColor: colors.surfaceHighlight,
                      borderColor: colors.border,
                      color: colors.textPrimary,
                    },
                  ]}
                  value={selectedScheduleDate}
                  onChangeText={setSelectedScheduleDate}
                  placeholder="2026-10-27"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* Quick Time Pills */}
              <View style={styles.quickPillsRow}>
                {["08:00", "09:00", "13:00", "17:00", "20:00"].map((t) => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setSelectedScheduleTime(t)}
                    style={[
                      styles.quickPill,
                      {
                        backgroundColor:
                          selectedScheduleTime === t
                            ? colors.primary
                            : colors.surfaceHighlight,
                        borderColor:
                          selectedScheduleTime === t
                            ? colors.primary
                            : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.quickPillText,
                        {
                          color:
                            selectedScheduleTime === t
                              ? "#FFFFFF"
                              : colors.textPrimary,
                          fontWeight:
                            selectedScheduleTime === t ? "700" : "500",
                        },
                      ]}
                    >
                      {t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Time Input */}
              <View style={styles.inputFieldBlock}>
                <Text
                  style={[styles.inputFieldLabel, { color: colors.textSecondary }]}
                >
                  Time (HH:MM)
                </Text>
                <TextInput
                  style={[
                    styles.customInput,
                    {
                      backgroundColor: colors.surfaceHighlight,
                      borderColor: colors.border,
                      color: colors.textPrimary,
                    },
                  ]}
                  value={selectedScheduleTime}
                  onChangeText={setSelectedScheduleTime}
                  placeholder="08:00"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                onPress={() => handleConfirmSchedule()}
                disabled={sending}
                style={[
                  styles.confirmScheduleButton,
                  { backgroundColor: colors.primary, opacity: sending ? 0.7 : 1 },
                ]}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Clock
                      size={18}
                      color="#FFFFFF"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.confirmScheduleText}>
                      {isScheduledEdit ? "Update Schedule" : "Schedule Send"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Timezone Search & Select Sub-Modal */}
      <Modal
        visible={scheduleTzModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setScheduleTzModalVisible(false)}
      >
        <SafeAreaView style={[styles.modalBackdrop, { padding: Spacing.md }]}>
          <View
            style={[
              styles.tzModalContent,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.tzModalHeader}>
              <Text
                style={[styles.modalTitle, { color: colors.textPrimary, marginBottom: 0 }]}
              >
                Select Timezone
              </Text>
              <TouchableOpacity
                onPress={() => setScheduleTzModalVisible(false)}
                style={{ padding: 4 }}
              >
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View
              style={[
                styles.tzSearchBox,
                {
                  backgroundColor: colors.surfaceHighlight,
                  borderColor: colors.border,
                },
              ]}
            >
              <Search
                size={16}
                color={colors.textMuted}
                style={{ marginRight: 8 }}
              />
              <TextInput
                style={[styles.tzSearchInput, { color: colors.textPrimary }]}
                placeholder="Search timezone (e.g. London, Tokyo)..."
                placeholderTextColor={colors.textMuted}
                value={tzSearchQuery}
                onChangeText={setTzSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {tzSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setTzSearchQuery("")}>
                  <X size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView style={{ flex: 1 }}>
              {filteredTimezones.map((tz) => {
                const isSelected = scheduleTimezone === tz;
                return (
                  <TouchableOpacity
                    key={tz}
                    onPress={() => {
                      setScheduleTimezone(tz);
                      setScheduleTzModalVisible(false);
                    }}
                    style={[
                      styles.tzItemRow,
                      {
                        backgroundColor: isSelected
                          ? colors.surfaceHighlight
                          : "transparent",
                        borderBottomColor: colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tzItemText,
                        {
                          color: isSelected
                            ? colors.primary
                            : colors.textPrimary,
                          fontWeight: isSelected ? "700" : "400",
                        },
                      ]}
                    >
                      {tz}
                    </Text>
                    {isSelected && (
                      <Check size={18} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  headerRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  attachButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  sendButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: Typography.weights.bold,
  },
  scheduledBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  scheduledBannerTitle: {
    fontSize: Typography.sizes.xs + 1,
    fontWeight: Typography.weights.semibold,
  },
  scheduledBannerSub: {
    fontSize: Typography.sizes.xs - 1,
    marginTop: 1,
  },
  bannerActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  bannerActionText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: Spacing.sm,
    fontSize: Typography.sizes.sm,
  },
  formScroll: {
    flex: 1,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fieldLabel: {
    width: 65,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
  },
  fromAccountWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  fromAccountText: {
    flex: 1,
    fontSize: Typography.sizes.sm,
  },
  fieldInput: {
    flex: 1,
    fontSize: Typography.sizes.sm,
    padding: 0,
  },
  ccToggle: {
    paddingLeft: Spacing.sm,
  },
  ccToggleText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  rtToolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 18,
  },
  rtToolbarButton: {
    padding: 4,
  },
  rtWebView: {
    width: "100%",
    minHeight: 250,
  },
  attachmentsContainer: {
    padding: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  attachmentsTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  attachmentsLabel: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  addMoreBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  addMoreText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  attachmentsList: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2,
  },
  attachmentChip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  attachmentChipName: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.medium,
  },
  attachmentChipSize: {
    fontSize: Typography.sizes.xs - 2,
  },
  removeAttachmentBtn: {
    marginLeft: 6,
    padding: 2,
  },
  cancelSendContainer: {
    padding: Spacing.lg,
    alignItems: "center",
  },
  cancelSendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    borderWidth: 1,
    width: "100%",
  },
  cancelSendText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  modalContent: {
    borderRadius: 16,
    borderWidth: 1,
    padding: Spacing.lg,
    maxHeight: "70%",
  },
  modalTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.md,
  },
  modalItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  modalItemText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.medium,
  },
  modalItemSubtext: {
    fontSize: Typography.sizes.xs,
    marginTop: 2,
  },
  scheduleModalContent: {
    borderRadius: 16,
    borderWidth: 1,
    padding: Spacing.lg,
    maxHeight: "85%",
  },
  scheduleModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  tzSelectorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  tzSelectorLabel: {
    fontSize: Typography.sizes.xs - 1,
    fontWeight: Typography.weights.medium,
  },
  tzSelectorValue: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    marginTop: 2,
  },
  tzChangeButtonText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  scheduleSectionTitle: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  presetsList: {
    gap: 8,
    marginBottom: Spacing.xs,
  },
  presetItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  presetLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  presetDisplayTime: {
    fontSize: Typography.sizes.xs,
    marginTop: 2,
  },
  quickPillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: Spacing.xs,
  },
  quickPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  quickPillText: {
    fontSize: Typography.sizes.xs,
  },
  inputFieldBlock: {
    marginBottom: Spacing.sm,
  },
  inputFieldLabel: {
    fontSize: Typography.sizes.xs,
    marginBottom: 4,
  },
  customInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: Typography.sizes.sm,
  },
  confirmScheduleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  confirmScheduleText: {
    color: "#FFFFFF",
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
  },
  tzModalContent: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: Spacing.lg,
  },
  tzModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  tzSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: Spacing.sm,
  },
  tzSearchInput: {
    flex: 1,
    fontSize: Typography.sizes.sm,
    padding: 0,
  },
  tzItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tzItemText: {
    fontSize: Typography.sizes.sm,
  },
});
