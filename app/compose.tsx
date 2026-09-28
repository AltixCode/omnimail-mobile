import React, { useState, useEffect } from "react";
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
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import {
  X,
  Send,
  ChevronDown,
  Check,
  Paperclip,
  FileText,
  Trash2,
} from "lucide-react-native";
import { useTheme } from "../src/context/ThemeContext";
import { api } from "../src/services/api";
import { MailAccount } from "../src/types";
import { Spacing, Typography } from "../src/constants/theme";

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
  }>();

  const { colors } = useTheme();

  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    params.accountId || ""
  );
  const [showCc, setShowCc] = useState<boolean>(Boolean(params.cc));
  const [to, setTo] = useState<string>(params.to || "");
  const [cc, setCc] = useState<string>(params.cc || "");
  const [subject, setSubject] = useState<string>(params.subject || "");
  const [bodyText, setBodyText] = useState<string>(params.bodyText || "");

  interface LocalAttachment {
    name: string;
    size: number;
    uri: string;
    mimeType: string;
  }
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);

  const [sending, setSending] = useState(false);
  const [accountModalVisible, setAccountModalVisible] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, []);

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

        const MAX_TOTAL_SIZE = 25 * 1024 * 1024; // 25MB standard email attachment limit
        const currentSum = attachments.reduce((sum, a) => sum + a.size, 0);
        const incomingSum = newItems.reduce((sum, a) => sum + a.size, 0);

        if (currentSum + incomingSum > MAX_TOTAL_SIZE) {
          Alert.alert(
            "Attachment Size Exceeded",
            "Total attachment size cannot exceed 25 MB. Please select smaller files."
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

  const handleSend = async () => {
    if (!selectedAccountId) {
      Alert.alert("Missing Account", "Please select an account to send from.");
      return;
    }
    if (!to.trim()) {
      Alert.alert("Missing Recipient", "Please enter at least one recipient email address in 'To'.");
      return;
    }
    if (!subject.trim()) {
      Alert.alert("Missing Subject", "Please provide a subject line.");
      return;
    }

    try {
      setSending(true);

      // Encode attachments to base64
      let encodedAttachments: Array<{
        filename: string;
        content: string;
        contentType: string;
        size: number;
      }> | undefined;

      if (attachments.length > 0) {
        encodedAttachments = await Promise.all(
          attachments.map(async (att) => {
            let base64Data = "";
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
            return {
              filename: att.name,
              content: base64Data,
              contentType: att.mimeType,
              size: att.size,
            };
          })
        );
      }

      await api.messages.send({
        accountId: selectedAccountId,
        to: to.trim(),
        cc: cc.trim() || undefined,
        subject: subject.trim(),
        bodyText,
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
      Alert.alert("Send Failed", err.message || "Failed to dispatch email. Please check your credentials.");
    } finally {
      setSending(false);
    }
  };

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
          New Message
        </Text>

        <View style={styles.headerRightActions}>
          <TouchableOpacity
            onPress={handlePickAttachment}
            disabled={sending}
            style={[styles.attachButton, { backgroundColor: colors.surfaceHighlight }]}
          >
            <Paperclip size={18} color={colors.textPrimary} />
            {attachments.length > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                <Text style={styles.badgeText}>{attachments.length}</Text>
              </View>
            )}
          </TouchableOpacity>

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
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
          {/* From Account Selector */}
          <TouchableOpacity
            style={[styles.fieldRow, { borderBottomColor: colors.border }]}
            onPress={() => setAccountModalVisible(true)}
          >
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              From:
            </Text>
            <View style={styles.fromAccountWrapper}>
              <Text
                numberOfLines={1}
                style={[styles.fromAccountText, { color: colors.textPrimary }]}
              >
                {selectedAccount
                  ? `${selectedAccount.label} <${selectedAccount.emailAddress}>`
                  : "Select sending account..."}
              </Text>
              <ChevronDown size={16} color={colors.textSecondary} style={{ marginLeft: 6 }} />
            </View>
          </TouchableOpacity>

          {/* To Field */}
          <View style={[styles.fieldRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
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
            <View style={[styles.fieldRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
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
          <View style={[styles.fieldRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              Subject:
            </Text>
            <TextInput
              style={[
                styles.fieldInput,
                { color: colors.textPrimary, fontWeight: Typography.weights.medium },
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
                { backgroundColor: colors.surfaceHighlight, borderBottomColor: colors.border },
              ]}
            >
              <View style={styles.attachmentsTopRow}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Paperclip size={14} color={colors.textSecondary} style={{ marginRight: 4 }} />
                  <Text style={[styles.attachmentsLabel, { color: colors.textSecondary }]}>
                    Attachments ({attachments.length}) · {formatFileSize(totalAttachmentsSize)}
                  </Text>
                </View>
                <TouchableOpacity onPress={handlePickAttachment} style={styles.addMoreBtn}>
                  <Text style={[styles.addMoreText, { color: colors.primary }]}>+ Add more</Text>
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
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                  >
                    <FileText size={14} color={colors.primary} style={{ marginRight: 6 }} />
                    <View style={{ maxWidth: 120 }}>
                      <Text
                        numberOfLines={1}
                        style={[styles.attachmentChipName, { color: colors.textPrimary }]}
                      >
                        {att.name}
                      </Text>
                      <Text style={[styles.attachmentChipSize, { color: colors.textMuted }]}>
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

          {/* Body Multiline Input */}
          <TextInput
            style={[
              styles.bodyInput,
              {
                color: colors.textPrimary,
              },
            ]}
            placeholder="Compose email..."
            placeholderTextColor={colors.textMuted}
            value={bodyText}
            onChangeText={setBodyText}
            multiline
            textAlignVertical="top"
          />
        </ScrollView>
      </KeyboardAvoidingView>

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
                    <Text style={[styles.modalItemText, { color: colors.textPrimary }]}>
                      {acc.label}
                    </Text>
                    <Text
                      style={[styles.modalItemSubtext, { color: colors.textMuted }]}
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
  bodyInput: {
    flex: 1,
    padding: Spacing.lg,
    fontSize: Typography.sizes.base,
    lineHeight: 22,
    minHeight: 300,
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
});
