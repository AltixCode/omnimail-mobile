import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Modal,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  format,
  parseISO,
  isToday,
  isTomorrow,
  isPast,
  isSameDay,
  startOfDay,
  isBefore,
  addHours,
  addMinutes,
  roundToNearestMinutes,
} from "date-fns";
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  RotateCw,
  Plus,
  Check,
  Minus,
  X,
} from "lucide-react-native";
import { useAuth } from "../../src/context/AuthContext";
import { useTheme } from "../../src/context/ThemeContext";
import { api } from "../../src/services/api";
import { Calendar, CalendarEvent } from "../../src/types";
import { EmptyState } from "../../src/components/EmptyState";
import { Input } from "../../src/components/Input";
import { Button } from "../../src/components/Button";
import { Spacing, Typography } from "../../src/constants/theme";

interface DayGroup {
  date: Date;
  dateKey: string;
  displayTitle: string;
  events: CalendarEvent[];
}

export default function CalendarScreen() {
  const { isAuthenticated } = useAuth();
  const { colors } = useTheme();

  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(
    null,
  );
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCalendarData = useCallback(
    async (isRefresh = false) => {
      try {
        if (!isRefresh) setLoading(true);
        setError(null);

        const res = await api.calendar.get({
          calendarId: selectedCalendarId || undefined,
        });

        setCalendars(res.calendars || []);
        setEvents(res.events || []);
      } catch (err: any) {
        console.error("Calendar fetch error:", err);
        setError(err.message || "Failed to load calendar events");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedCalendarId],
  );

  useEffect(() => {
    if (isAuthenticated) {
      fetchCalendarData();
    }
  }, [fetchCalendarData, isAuthenticated]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchCalendarData(true);
  };

  // New event creation
  const defaultStart = () =>
    roundToNearestMinutes(addHours(new Date(), 1), { nearestTo: 15 });

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newSummary, setNewSummary] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newIsAllDay, setNewIsAllDay] = useState(false);
  const [newStartDate, setNewStartDate] = useState<Date>(defaultStart());
  const [newEndDate, setNewEndDate] = useState<Date>(
    addHours(defaultStart(), 1),
  );
  const [newCalendarId, setNewCalendarId] = useState<string | null>(null);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const openCreateModal = () => {
    const start = defaultStart();
    setNewSummary("");
    setNewLocation("");
    setNewDescription("");
    setNewIsAllDay(false);
    setNewStartDate(start);
    setNewEndDate(addHours(start, 1));
    setNewCalendarId(calendars[0]?.id || null);
    setCreateError(null);
    setCreateModalVisible(true);
  };

  const adjustStart = (minutes: number) => {
    setNewStartDate((prev) => {
      const next = addMinutes(prev, minutes);
      // Keep the end date from ever landing before the (possibly moved) start.
      setNewEndDate((prevEnd) =>
        isBefore(prevEnd, next) ? addHours(next, 1) : prevEnd,
      );
      return next;
    });
  };

  const adjustEnd = (minutes: number) => {
    setNewEndDate((prev) => {
      const next = addMinutes(prev, minutes);
      return isBefore(next, newStartDate) ? newStartDate : next;
    });
  };

  const handleCreateEvent = async () => {
    if (!newSummary.trim()) {
      setCreateError("Please enter an event title.");
      return;
    }
    const calendarId = newCalendarId || calendars[0]?.id;
    if (!calendarId) {
      setCreateError("No calendar is available to add this event to yet.");
      return;
    }

    try {
      setCreatingEvent(true);
      setCreateError(null);
      await api.calendar.createEvent({
        calendarId,
        summary: newSummary.trim(),
        description: newDescription.trim() || undefined,
        location: newLocation.trim() || undefined,
        startDate: newStartDate.toISOString(),
        endDate: newEndDate.toISOString(),
        isAllDay: newIsAllDay,
      });
      setCreateModalVisible(false);
      await fetchCalendarData(true);
    } catch (err: any) {
      setCreateError(err.message || "Failed to create the event");
    } finally {
      setCreatingEvent(false);
    }
  };

  // Group events by day for Agenda view. Only today-onward: an agenda that
  // opens on a birthday from last April instead of today isn't useful, and
  // isn't what "Today" in the day header should imply.
  const groupedEvents: DayGroup[] = React.useMemo(() => {
    const map = new Map<string, DayGroup>();
    const todayStart = startOfDay(new Date());

    const upcomingEvents = events.filter((evt) => {
      try {
        const relevantEnd = parseISO(evt.endDate || evt.startDate);
        return !isBefore(relevantEnd, todayStart);
      } catch {
        return true;
      }
    });

    const sortedEvents = upcomingEvents.sort(
      (a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );

    for (const evt of sortedEvents) {
      try {
        const startDate = parseISO(evt.startDate);
        const dateKey = format(startDate, "yyyy-MM-dd");

        let group = map.get(dateKey);
        if (!group) {
          let displayTitle = format(startDate, "EEEE, MMMM d");
          if (isToday(startDate))
            displayTitle = `Today · ${format(startDate, "MMMM d")}`;
          else if (isTomorrow(startDate))
            displayTitle = `Tomorrow · ${format(startDate, "MMMM d")}`;

          group = {
            date: startDate,
            dateKey,
            displayTitle,
            events: [],
          };
          map.set(dateKey, group);
        }
        group.events.push(evt);
      } catch (e) {
        // Skip invalid date
      }
    }

    return Array.from(map.values());
  }, [events]);

  const formatEventTime = (event: CalendarEvent) => {
    if (event.isAllDay) return "All day";
    try {
      const start = parseISO(event.startDate);
      const end = parseISO(event.endDate);
      return `${format(start, "h:mm a")} - ${format(end, "h:mm a")}`;
    } catch {
      return "Scheduled";
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      {/* Top Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>
          Calendar & Agenda
        </Text>
      </View>

      {/* Calendar Filter Pills */}
      {calendars.length > 0 && (
        <View
          style={[
            styles.calendarFilterBar,
            { borderBottomColor: colors.border },
          ]}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.calendarFilterScroll}
          >
            <TouchableOpacity
              onPress={() => setSelectedCalendarId(null)}
              style={[
                styles.calendarPill,
                {
                  backgroundColor:
                    selectedCalendarId === null
                      ? colors.primaryLight
                      : colors.surface,
                  borderColor:
                    selectedCalendarId === null
                      ? colors.primary
                      : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.calendarPillText,
                  {
                    color:
                      selectedCalendarId === null
                        ? colors.primary
                        : colors.textSecondary,
                  },
                ]}
              >
                All Calendars
              </Text>
            </TouchableOpacity>

            {calendars.map((cal) => {
              const isSelected = selectedCalendarId === cal.id;
              return (
                <TouchableOpacity
                  key={cal.id}
                  onPress={() => setSelectedCalendarId(cal.id)}
                  style={[
                    styles.calendarPill,
                    {
                      backgroundColor: isSelected
                        ? colors.primaryLight
                        : colors.surface,
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.calendarColorDot,
                      { backgroundColor: cal.color || colors.primary },
                    ]}
                  />
                  <Text
                    style={[
                      styles.calendarPillText,
                      {
                        color: isSelected
                          ? colors.primary
                          : colors.textSecondary,
                      },
                    ]}
                  >
                    {cal.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Error state */}
      {error && (
        <View
          style={[styles.errorBar, { backgroundColor: colors.dangerLight }]}
        >
          <Text style={[styles.errorText, { color: colors.danger }]}>
            {error}
          </Text>
          <TouchableOpacity
            onPress={() => fetchCalendarData()}
            style={styles.retryBtn}
          >
            <RotateCw
              size={14}
              color={colors.danger}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.retryText, { color: colors.danger }]}>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Agenda list */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>
            Loading agenda...
          </Text>
        </View>
      ) : (
        <FlatList
          data={groupedEvents}
          keyExtractor={(item) => item.dateKey}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon={<CalendarIcon size={48} color={colors.textMuted} />}
              title="No upcoming events"
              description="No calendar events scheduled in this period. Pull down to refresh or check your connected CalDAV accounts."
              actionTitle="Refresh Agenda"
              onAction={handleRefresh}
            />
          }
          renderItem={({ item }) => (
            <View style={styles.daySection}>
              {/* Day Header */}
              <View
                style={[
                  styles.dayHeader,
                  { backgroundColor: colors.surfaceHighlight },
                ]}
              >
                <Text
                  style={[styles.dayHeaderText, { color: colors.textPrimary }]}
                >
                  {item.displayTitle}
                </Text>
              </View>

              {/* Events for this day */}
              {item.events.map((evt) => {
                const calColor = evt.calendar?.color || colors.primary;
                return (
                  <View
                    key={evt.id}
                    style={[
                      styles.eventCard,
                      {
                        backgroundColor: colors.surface,
                        borderLeftColor: calColor,
                        borderBottomColor: colors.border,
                      },
                    ]}
                  >
                    <View style={styles.eventTimeRow}>
                      <Clock
                        size={13}
                        color={colors.textMuted}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          styles.eventTimeText,
                          { color: colors.textMuted },
                        ]}
                      >
                        {formatEventTime(evt)}
                      </Text>
                      {evt.calendar?.name && (
                        <View
                          style={[
                            styles.eventCalendarBadge,
                            { backgroundColor: `${calColor}20` },
                          ]}
                        >
                          <Text
                            style={[
                              styles.eventCalendarBadgeText,
                              { color: calColor },
                            ]}
                          >
                            {evt.calendar.name}
                          </Text>
                        </View>
                      )}
                    </View>

                    <Text
                      style={[
                        styles.eventSummary,
                        { color: colors.textPrimary },
                      ]}
                    >
                      {evt.summary}
                    </Text>

                    {evt.location ? (
                      <View style={styles.eventLocationRow}>
                        <MapPin
                          size={13}
                          color={colors.textSecondary}
                          style={{ marginRight: 4 }}
                        />
                        <Text
                          style={[
                            styles.eventLocationText,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {evt.location}
                        </Text>
                      </View>
                    ) : null}

                    {evt.description ? (
                      <Text
                        numberOfLines={2}
                        style={[
                          styles.eventDescription,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {evt.description}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        />
      )}

      {/* Floating "New Event" Button */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        activeOpacity={0.8}
        onPress={openCreateModal}
      >
        <Plus size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {/* New Event Modal */}
      <Modal
        visible={createModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.createModalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View
            style={[
              styles.createModalContent,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.createModalHeader}>
              <Text
                style={[styles.createModalTitle, { color: colors.textPrimary }]}
              >
                New Event
              </Text>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                <X size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              {createError ? (
                <View
                  style={[
                    styles.createErrorBanner,
                    { backgroundColor: colors.dangerLight },
                  ]}
                >
                  <Text
                    style={{
                      color: colors.danger,
                      fontSize: Typography.sizes.xs,
                    }}
                  >
                    {createError}
                  </Text>
                </View>
              ) : null}

              <Input
                label="Title"
                placeholder="Event title"
                value={newSummary}
                onChangeText={setNewSummary}
              />

              {calendars.length > 1 && (
                <View style={{ marginBottom: Spacing.md }}>
                  <Text
                    style={[
                      styles.createFieldLabel,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Calendar
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {calendars.map((cal) => {
                      const isSelected = newCalendarId === cal.id;
                      return (
                        <TouchableOpacity
                          key={cal.id}
                          onPress={() => setNewCalendarId(cal.id)}
                          style={[
                            styles.calendarPill,
                            {
                              backgroundColor: isSelected
                                ? colors.primaryLight
                                : colors.surface,
                              borderColor: isSelected
                                ? colors.primary
                                : colors.border,
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.calendarColorDot,
                              { backgroundColor: cal.color || colors.primary },
                            ]}
                          />
                          <Text
                            style={[
                              styles.calendarPillText,
                              {
                                color: isSelected
                                  ? colors.primary
                                  : colors.textSecondary,
                              },
                            ]}
                          >
                            {cal.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              <View style={styles.allDayRow}>
                <Text
                  style={[
                    styles.createFieldLabel,
                    { color: colors.textSecondary },
                  ]}
                >
                  All Day
                </Text>
                <Switch
                  value={newIsAllDay}
                  onValueChange={setNewIsAllDay}
                  trackColor={{ false: colors.textMuted, true: colors.primary }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor={colors.textMuted}
                />
              </View>

              {!newIsAllDay && (
                <>
                  <View style={styles.dateAdjustRow}>
                    <Text
                      style={[
                        styles.createFieldLabel,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Starts
                    </Text>
                    <View style={styles.dateAdjustControls}>
                      <TouchableOpacity
                        style={[
                          styles.dateStepBtn,
                          { backgroundColor: colors.surfaceHighlight },
                        ]}
                        onPress={() => adjustStart(-15)}
                      >
                        <Minus size={14} color={colors.textPrimary} />
                      </TouchableOpacity>
                      <Text
                        style={[
                          styles.dateAdjustText,
                          { color: colors.textPrimary },
                        ]}
                      >
                        {format(newStartDate, "EEE MMM d, h:mm a")}
                      </Text>
                      <TouchableOpacity
                        style={[
                          styles.dateStepBtn,
                          { backgroundColor: colors.surfaceHighlight },
                        ]}
                        onPress={() => adjustStart(15)}
                      >
                        <Plus size={14} color={colors.textPrimary} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.dateAdjustRow}>
                    <Text
                      style={[
                        styles.createFieldLabel,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Ends
                    </Text>
                    <View style={styles.dateAdjustControls}>
                      <TouchableOpacity
                        style={[
                          styles.dateStepBtn,
                          { backgroundColor: colors.surfaceHighlight },
                        ]}
                        onPress={() => adjustEnd(-15)}
                      >
                        <Minus size={14} color={colors.textPrimary} />
                      </TouchableOpacity>
                      <Text
                        style={[
                          styles.dateAdjustText,
                          { color: colors.textPrimary },
                        ]}
                      >
                        {format(newEndDate, "EEE MMM d, h:mm a")}
                      </Text>
                      <TouchableOpacity
                        style={[
                          styles.dateStepBtn,
                          { backgroundColor: colors.surfaceHighlight },
                        ]}
                        onPress={() => adjustEnd(15)}
                      >
                        <Plus size={14} color={colors.textPrimary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              )}

              <Input
                label="Location (Optional)"
                placeholder="Meeting room, address, or link"
                value={newLocation}
                onChangeText={setNewLocation}
              />

              <Input
                label="Description (Optional)"
                placeholder="Notes about this event"
                value={newDescription}
                onChangeText={setNewDescription}
                multiline
                style={{ minHeight: 70, textAlignVertical: "top" }}
              />

              <Button
                title="Create Event"
                onPress={handleCreateEvent}
                loading={creatingEvent}
                style={{ marginTop: Spacing.sm, marginBottom: Spacing.xl }}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  screenTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
  },
  calendarFilterBar: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  calendarFilterScroll: {
    paddingHorizontal: Spacing.lg,
  },
  calendarPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  calendarColorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  calendarPillText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.medium,
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
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  retryText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
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
  daySection: {
    marginBottom: Spacing.sm,
  },
  dayHeader: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 8,
  },
  dayHeaderText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  eventCard: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderLeftWidth: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  eventTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  eventTimeText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.medium,
  },
  eventCalendarBadge: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  eventCalendarBadgeText: {
    fontSize: 10,
    fontWeight: Typography.weights.semibold,
  },
  eventSummary: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    marginBottom: 4,
  },
  eventLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  eventLocationText: {
    fontSize: Typography.sizes.xs,
  },
  eventDescription: {
    fontSize: Typography.sizes.xs,
    lineHeight: 16,
    marginTop: 2,
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
  createModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  createModalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    padding: Spacing.lg,
    maxHeight: "85%",
  },
  createModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  createModalTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
  },
  createErrorBanner: {
    borderRadius: 8,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  createFieldLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
    marginBottom: 6,
  },
  allDayRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  dateAdjustRow: {
    marginBottom: Spacing.md,
  },
  dateAdjustControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateStepBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  dateAdjustText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
    flex: 1,
    textAlign: "center",
  },
});
