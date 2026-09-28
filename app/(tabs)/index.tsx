import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Search,
  Filter,
  Check,
  RotateCw,
  Edit,
  Inbox,
  Star,
  Send,
  Archive,
  Trash2,
  X,
  SlidersHorizontal,
  ChevronDown,
  Mail,
  Plus,
} from "lucide-react-native";
import { useAuth } from "../../src/context/AuthContext";
import { useTheme } from "../../src/context/ThemeContext";
import { api } from "../../src/services/api";
import { MessageListItem, MailAccount, Folder } from "../../src/types";
import { MessageCard } from "../../src/components/MessageCard";
import { EmptyState } from "../../src/components/EmptyState";
import { AddAccountModal } from "../../src/components/AddAccountModal";
import { Spacing, Typography } from "../../src/constants/theme";

const FOLDERS = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "starred", label: "Starred", icon: Star },
  { id: "sent", label: "Sent", icon: Send },
  { id: "archive", label: "Archive", icon: Archive },
  { id: "trash", label: "Trash", icon: Trash2 },
  { id: "all", label: "All Mail", icon: SlidersHorizontal },
];

export default function InboxScreen() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuth();
  const { colors } = useTheme();

  // State
  const [messages, setMessages] = useState<MessageListItem[]>([]);
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedView, setSelectedView] = useState<string>("inbox");
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");

  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filter Modals
  const [accountModalVisible, setAccountModalVisible] = useState(false);
  const [folderModalVisible, setFolderModalVisible] = useState(false);
  const [addAccountModalVisible, setAddAccountModalVisible] = useState(false);

  // Search debounce
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedQuery(text.trim());
    }, 400);
  };

  // Fetch accounts on mount
  useEffect(() => {
    if (isAuthenticated) {
      loadAccounts();
    }
  }, [isAuthenticated]);

  const loadAccounts = async () => {
    try {
      const res = await api.accounts.list();
      setAccounts(res.accounts || []);
    } catch (err) {
      console.warn("Failed to load accounts:", err);
    }
  };

  // Fetch messages whenever filters change
  const fetchMessages = useCallback(
    async (pageToFetch: number, isRefresh: boolean = false) => {
      try {
        if (pageToFetch === 1) {
          if (!isRefresh) setLoadingInitial(true);
        } else {
          setLoadingMore(true);
        }
        setError(null);

        const res = await api.messages.list({
          page: pageToFetch,
          limit: 30,
          view: selectedView,
          accountId: selectedAccountId || undefined,
          unreadOnly: unreadOnly || undefined,
          query: debouncedQuery || undefined,
        });

        if (pageToFetch === 1) {
          setMessages(res.messages);
        } else {
          setMessages((prev) => [...prev, ...res.messages]);
        }

        setHasMore(pageToFetch < res.pagination.totalPages);
        setPage(pageToFetch);
      } catch (err: any) {
        console.error("Error fetching messages:", err);
        setError(err.message || "Failed to load messages");
      } finally {
        setLoadingInitial(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [selectedView, selectedAccountId, unreadOnly, debouncedQuery]
  );

  useEffect(() => {
    if (isAuthenticated) {
      fetchMessages(1);
    }
  }, [fetchMessages, isAuthenticated]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await api.sync.trigger(selectedAccountId || undefined);
    } catch (err) {
      console.warn("Sync trigger warning:", err);
    }
    await fetchMessages(1, true);
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore && !loadingInitial) {
      fetchMessages(page + 1);
    }
  };

  // Star/Unstar toggle
  const handleToggleStar = async (item: MessageListItem) => {
    const newStarred = !item.isStarred;
    // Optimistic update
    setMessages((prev) =>
      prev.map((m) => (m.id === item.id ? { ...m, isStarred: newStarred } : m))
    );

    try {
      await api.messages.update(item.id, { isStarred: newStarred });
    } catch (err) {
      // Revert on failure
      setMessages((prev) =>
        prev.map((m) => (m.id === item.id ? { ...m, isStarred: !newStarred } : m))
      );
      Alert.alert("Error", "Could not update star status");
    }
  };

  const getAccountLabel = () => {
    if (!selectedAccountId) return "All Inboxes";
    const found = accounts.find((a) => a.id === selectedAccountId);
    return found ? found.label : "Account";
  };

  const getViewLabel = () => {
    const found = FOLDERS.find((f) => f.id === selectedView);
    return found ? found.label : "Inbox";
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      {/* Top Header & Search Bar */}
      <View style={[styles.headerContainer, { borderBottomColor: colors.border }]}>
        <View style={styles.topRow}>
          <TouchableOpacity
            style={[styles.accountSelectorButton, { backgroundColor: colors.surfaceHighlight }]}
            onPress={() => setAccountModalVisible(true)}
          >
            <Text
              numberOfLines={1}
              style={[styles.accountSelectorText, { color: colors.textPrimary }]}
            >
              {getAccountLabel()}
            </Text>
            <ChevronDown size={16} color={colors.textSecondary} style={{ marginLeft: 4 }} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.folderSelectorButton, { backgroundColor: colors.surfaceHighlight }]}
            onPress={() => setFolderModalVisible(true)}
          >
            <Text
              numberOfLines={1}
              style={[styles.folderSelectorText, { color: colors.textPrimary }]}
            >
              {getViewLabel()}
            </Text>
            <ChevronDown size={16} color={colors.textSecondary} style={{ marginLeft: 4 }} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.unreadChip,
              {
                backgroundColor: unreadOnly ? colors.primaryLight : colors.surfaceHighlight,
                borderColor: unreadOnly ? colors.primary : colors.border,
              },
            ]}
            onPress={() => setUnreadOnly(!unreadOnly)}
          >
            <Text
              style={[
                styles.unreadChipText,
                { color: unreadOnly ? colors.primary : colors.textSecondary },
              ]}
            >
              Unread
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View
          style={[
            styles.searchBar,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Search size={18} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Search mail (e.g. from: invoice, subject: update)..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={handleSearchChange}
            clearButtonMode="while-editing"
            autoCapitalize="none"
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => handleSearchChange("")}>
              <X size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Network / Error Notice */}
      {error && (
        <View style={[styles.errorBar, { backgroundColor: colors.dangerLight }]}>
          <Text style={[styles.errorText, { color: colors.danger }]}>
            {error}
          </Text>
          <TouchableOpacity onPress={() => fetchMessages(1)} style={styles.retryButton}>
            <RotateCw size={14} color={colors.danger} style={{ marginRight: 4 }} />
            <Text style={[styles.retryText, { color: colors.danger }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Message List */}
      {loadingInitial ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>
            Loading messages...
          </Text>
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MessageCard
              message={item}
              onPress={() => router.push(`/message/${item.id}`)}
              onToggleStar={() => handleToggleStar(item)}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            accounts.length === 0 ? (
              <EmptyState
                icon={<Mail size={56} color={colors.primary} />}
                title="Hey! This is empty"
                description="Add your first email account to start. OmniMail is an email aggregator, not a mail server — connect your existing accounts (Gmail, Fastmail, iCloud, custom IMAP) to manage all your mail in one place."
                actionTitle="Add Your First Account"
                onAction={() => setAddAccountModalVisible(true)}
              />
            ) : (
              <EmptyState
                icon={<Inbox size={48} color={colors.textMuted} />}
                title="No messages found"
                description={
                  searchQuery
                    ? "No results matching your query."
                    : unreadOnly
                    ? "You have caught up with all unread mail."
                    : "This folder is currently empty."
                }
                actionTitle="Sync Now"
                onAction={handleRefresh}
              />
            )
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : null
          }
        />
      )}

      {/* Floating Compose Button */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        activeOpacity={0.8}
        onPress={() => router.push("/compose")}
      >
        <Edit size={22} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Account Selector Modal */}
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
              Select Account
            </Text>
            <ScrollView>
              <TouchableOpacity
                style={[
                  styles.modalItem,
                  {
                    backgroundColor:
                      selectedAccountId === null
                        ? colors.surfaceHighlight
                        : "transparent",
                  },
                ]}
                onPress={() => {
                  setSelectedAccountId(null);
                  setAccountModalVisible(false);
                }}
              >
                <Text style={[styles.modalItemText, { color: colors.textPrimary }]}>
                  All Inboxes
                </Text>
                {selectedAccountId === null && (
                  <Check size={18} color={colors.primary} />
                )}
              </TouchableOpacity>

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
                  <View>
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

              <TouchableOpacity
                style={[
                  styles.modalItem,
                  {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: colors.border,
                    marginTop: 4,
                  },
                ]}
                onPress={() => {
                  setAccountModalVisible(false);
                  setAddAccountModalVisible(true);
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Plus size={16} color={colors.primary} />
                  <Text
                    style={[
                      styles.modalItemText,
                      { color: colors.primary, fontWeight: Typography.weights.semibold },
                    ]}
                  >
                    Add Email Account
                  </Text>
                </View>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Folder Selector Modal */}
      <Modal
        visible={folderModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFolderModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setFolderModalVisible(false)}
        >
          <View
            style={[
              styles.modalContent,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              Select Folder View
            </Text>
            <ScrollView>
              {FOLDERS.map((f) => {
                const IconComponent = f.icon;
                const isSelected = selectedView === f.id;
                return (
                  <TouchableOpacity
                    key={f.id}
                    style={[
                      styles.modalItem,
                      {
                        backgroundColor: isSelected
                          ? colors.surfaceHighlight
                          : "transparent",
                      },
                    ]}
                    onPress={() => {
                      setSelectedView(f.id);
                      setFolderModalVisible(false);
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <IconComponent
                        size={18}
                        color={isSelected ? colors.primary : colors.textSecondary}
                        style={{ marginRight: 12 }}
                      />
                      <Text
                        style={[
                          styles.modalItemText,
                          {
                            color: isSelected ? colors.primary : colors.textPrimary,
                            fontWeight: isSelected
                              ? Typography.weights.semibold
                              : Typography.weights.regular,
                          },
                        ]}
                      >
                        {f.label}
                      </Text>
                    </View>
                    {isSelected && <Check size={18} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Add Account Modal */}
      <AddAccountModal
        visible={addAccountModalVisible}
        onClose={() => setAddAccountModalVisible(false)}
        onAccountAdded={() => {
          loadAccounts();
          handleRefresh();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  accountSelectorButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 6,
    maxWidth: 140,
  },
  accountSelectorText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  folderSelectorButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 6,
    maxWidth: 120,
  },
  folderSelectorText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
  },
  unreadChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    marginLeft: "auto",
  },
  unreadChipText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.md,
    height: 40,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: Typography.sizes.sm,
    paddingVertical: 4,
  },
  errorBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  errorText: {
    fontSize: Typography.sizes.xs,
    flex: 1,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: Spacing.sm,
  },
  retryText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: Typography.sizes.sm,
  },
  footerLoader: {
    paddingVertical: Spacing.lg,
    alignItems: "center",
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
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
});
