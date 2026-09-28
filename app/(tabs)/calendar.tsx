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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  format,
  parseISO,
  isToday,
  isTomorrow,
  isPast,
  isSameDay,
} from "date-fns";
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  RotateCw,
  Plus,
  Check,
} from "lucide-react-native";
import { useAuth } from "../../src/context/AuthContext";
import { useTheme } from "../../src/context/ThemeContext";
import { api } from "../../src/services/api";
import { Calendar, CalendarEvent } from "../../src/types";
import { EmptyState } from "../../src/components/EmptyState";
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
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCalendarData = useCallback(async (isRefresh = false) => {
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
  }, [selectedCalendarId]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchCalendarData();
    }
  }, [fetchCalendarData, isAuthenticated]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchCalendarData(true);
  };

  // Group events by day for Agenda view
  const groupedEvents: DayGroup[] = React.useMemo(() => {
    const map = new Map<string, DayGroup>();

    const sortedEvents = [...events].sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );

    for (const evt of sortedEvents) {
      try {
        const startDate = parseISO(evt.startDate);
        const dateKey = format(startDate, "yyyy-MM-dd");

        let group = map.get(dateKey);
        if (!group) {
          let displayTitle = format(startDate, "EEEE, MMMM d");
          if (isToday(startDate)) displayTitle = `Today · ${format(startDate, "MMMM d")}`;
          else if (isTomorrow(startDate)) displayTitle = `Tomorrow · ${format(startDate, "MMMM d")}`;

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
        <View style={[styles.calendarFilterBar, { borderBottomColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.calendarFilterScroll}>
            <TouchableOpacity
              onPress={() => setSelectedCalendarId(null)}
              style={[
                styles.calendarPill,
                {
                  backgroundColor: selectedCalendarId === null ? colors.primaryLight : colors.surface,
                  borderColor: selectedCalendarId === null ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.calendarPillText,
                  { color: selectedCalendarId === null ? colors.primary : colors.textSecondary },
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
                      backgroundColor: isSelected ? colors.primaryLight : colors.surface,
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
                      { color: isSelected ? colors.primary : colors.textSecondary },
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
        <View style={[styles.errorBar, { backgroundColor: colors.dangerLight }]}>
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
          <TouchableOpacity onPress={() => fetchCalendarData()} style={styles.retryBtn}>
            <RotateCw size={14} color={colors.danger} style={{ marginRight: 4 }} />
            <Text style={[styles.retryText, { color: colors.danger }]}>Retry</Text>
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
                <Text style={[styles.dayHeaderText, { color: colors.textPrimary }]}>
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
                      <Clock size={13} color={colors.textMuted} style={{ marginRight: 4 }} />
                      <Text style={[styles.eventTimeText, { color: colors.textMuted }]}>
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
                        <MapPin size={13} color={colors.textSecondary} style={{ marginRight: 4 }} />
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
});
