import { useState } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isSameDay,
  parseISO,
} from "date-fns";
import type { Alert } from "@/types";

export function useCalendar(initialMonth = new Date(), alerts: Alert[] = []) {
  const [currentMonth, setCurrentMonth] = useState<Date>(initialMonth);

  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const daysGrid = eachDayOfInterval({ start: startDate, end: endDate });

  const getAlertsForDay = (day: Date) => {
    return alerts.filter((alert) => {
      try {
        const time = parseISO(alert.alert_time);
        return isSameDay(time, day);
      } catch {
        return false;
      }
    });
  };

  return {
    currentMonth,
    setCurrentMonth,
    handlePrevMonth,
    handleNextMonth,
    daysGrid,
    getAlertsForDay,
  };
}
