import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import {
  X,
  Inbox,
  Archive,
  ShieldAlert,
  Trash2,
  Tag,
  Folder as FolderIcon,
  Check,
} from "lucide-react-native";
import { useTheme } from "../context/ThemeContext";
import { api } from "../services/api";
import { Folder } from "../types";
import { Spacing, Typography } from "../constants/theme";

interface MoveFolderModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectDestination: (
    action: "inbox" | "archive" | "spam" | "trash" | "move",
    folderId?: string,
  ) => Promise<void>;
  title?: string;
}

export function MoveFolderModal({
  visible,
  onClose,
  onSelectDestination,
  title = "Move Message",
}: MoveFolderModalProps) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [moving, setMoving] = useState(false);
  const [accounts, setAccounts] = useState<
    Array<{
      id: string;
      label: string;
      emailAddress: string;
      folders: Folder[];
    }>
  >([]);

  useEffect(() => {
    if (visible) {
      loadFolders();
    }
  }, [visible]);

  const loadFolders = async () => {
    try {
      setLoading(true);
      const res = await api.folders.list();
      if (res && res.accounts) {
        setAccounts(res.accounts);
      }
    } catch (err) {
      console.error("Failed to load folders for move modal:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (
    action: "inbox" | "archive" | "spam" | "trash" | "move",
    folderId?: string,
  ) => {
    if (moving) return;
    try {
      setMoving(true);
      await onSelectDestination(action, folderId);
      onClose();
    } catch (err) {
      console.error("Move failed:", err);
    } finally {
      setMoving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.container,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          {/* Header */}
          <View
            style={[
              styles.header,
              { borderBottomColor: colors.border },
            ]}
          >
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              {title}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              disabled={moving}
              style={styles.closeBtn}
            >
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {moving ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text
                style={[styles.loaderText, { color: colors.textSecondary }]}
              >
                Moving...
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
              {/* Standard Destinations */}
              <Text
                style={[styles.sectionTitle, { color: colors.textMuted }]}
              >
                Standard Folders
              </Text>

              <TouchableOpacity
                style={[
                  styles.folderRow,
                  { borderBottomColor: colors.border },
                ]}
                onPress={() => handleSelect("inbox")}
              >
                <View style={styles.folderRowLeft}>
                  <Inbox size={18} color="#3B82F6" />
                  <Text
                    style={[styles.folderName, { color: colors.textPrimary }]}
                  >
                    Inbox
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.folderRow,
                  { borderBottomColor: colors.border },
                ]}
                onPress={() => handleSelect("archive")}
              >
                <View style={styles.folderRowLeft}>
                  <Archive size={18} color="#8B5CF6" />
                  <Text
                    style={[styles.folderName, { color: colors.textPrimary }]}
                  >
                    Archive
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.folderRow,
                  { borderBottomColor: colors.border },
                ]}
                onPress={() => handleSelect("spam")}
              >
                <View style={styles.folderRowLeft}>
                  <ShieldAlert size={18} color="#F59E0B" />
                  <Text
                    style={[styles.folderName, { color: colors.textPrimary }]}
                  >
                    Spam
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.folderRow,
                  { borderBottomColor: colors.border },
                ]}
                onPress={() => handleSelect("trash")}
              >
                <View style={styles.folderRowLeft}>
                  <Trash2 size={18} color="#EF4444" />
                  <Text
                    style={[styles.folderName, { color: colors.textPrimary }]}
                  >
                    Trash
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Custom Folders & Labels */}
              {loading ? (
                <View style={{ paddingVertical: 16 }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : (
                accounts.map((acc) => {
                  const customFolders = (acc.folders || []).filter(
                    (f) =>
                      f.specialUse !== "\\Inbox" &&
                      f.specialUse !== "\\Sent" &&
                      f.specialUse !== "\\Trash" &&
                      f.specialUse !== "\\Junk" &&
                      f.specialUse !== "\\Drafts" &&
                      f.specialUse !== "\\Archive" &&
                      f.name !== "[Gmail]" &&
                      f.path !== "[Gmail]",
                  );

                  if (customFolders.length === 0) return null;

                  return (
                    <View key={acc.id} style={{ marginTop: 16 }}>
                      <Text
                        style={[
                          styles.sectionTitle,
                          { color: colors.textMuted },
                        ]}
                      >
                        {acc.label || acc.emailAddress}
                      </Text>
                      {customFolders.map((f) => {
                        const cleanName = f.name
                          .replace(/^\[Gmail\]\/?/i, "")
                          .trim();
                        return (
                          <TouchableOpacity
                            key={f.id}
                            style={[
                              styles.folderRow,
                              { borderBottomColor: colors.border },
                            ]}
                            onPress={() => handleSelect("move", f.id)}
                          >
                            <View style={styles.folderRowLeft}>
                              <Tag size={17} color={colors.textSecondary} />
                              <Text
                                style={[
                                  styles.folderName,
                                  { color: colors.textPrimary },
                                ]}
                                numberOfLines={1}
                              >
                                {cleanName}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  );
                })
              )}
              <View style={{ height: 20 }} />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "flex-end",
  },
  container: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "75%",
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.bold,
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  sectionTitle: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginVertical: 8,
  },
  folderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  folderRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  folderName: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
  },
  loaderContainer: {
    paddingVertical: 48,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loaderText: {
    fontSize: Typography.sizes.sm,
  },
});
