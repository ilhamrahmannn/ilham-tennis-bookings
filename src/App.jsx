import coachImage from "./assets/ilham.jpg";
import aminurIlhamImage from "./assets/aminur-ilham.jpg";
import coachAsyrafImage from "./assets/coach-asyraf-profile.jpg";
import coachZaynSyafiqImage from "./assets/coach-zayn-syafiq.png";
import { GoogleAuthProvider, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut } from "firebase/auth";
import { Timestamp, addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { Bell, ClipboardCopy, Download, ExternalLink, MessageCircle, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { auth, db } from "./firebase";
import { downloadBookingPdf } from "./bookingPdf";

const roles = {
  SUPER_ADMIN: "super_admin",
  COACH: "coach",
  VIEWER: "viewer",
  PENDING_COACH: "pending_coach",
};



const hourlyRates = {
  1: 120,
  2: 150,
  3: 180,
  4: 200,
};

const packageOptions = {
  "4 Sessions": {
    label: "4 Sessions",
    totalSessions: 4,
    paymentAmount: 450,
  },
  "8 Sessions": {
    label: "8 Sessions",
    totalSessions: 8,
    paymentAmount: 800,
  },
  Custom: {
    label: "Custom",
    totalSessions: 1,
    paymentAmount: 0,
  },
};

const allTimeSlots = [
  "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM",
  "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM",
  "6:00 PM", "7:00 PM", "8:00 PM", "9:00 PM", "10:00 PM",
  "11:00 PM",
];

const leaveDayPatternLabels = {
  all: "Every day",
  weekdays: "Weekdays only",
  weekends: "Weekends only",
};

const serviceOptions = [
  {
    id: "kids",
    title: "Tennis Lessons for Kids",
    description:
      "Kids Tennis Lessons Johor Bahru with a choice of private coaching or group coaching.",
  },
  {
    id: "adult",
    title: "Adult Tennis Coaching",
    description:
      "Adult Tennis Coaching Johor Bahru is available for new players, returning players, and adults who want focused Tennis Training Johor Bahru sessions.",
  },
  {
    id: "sparring",
    title: "Sparring Session",
    description:
      "Book a focused hitting and match-play session to improve rally consistency, movement, tactics, and confidence.",
  },
  {
    id: "group",
    title: "Group Coaching",
    description:
      "Join a scheduled group coaching session at selected fixed times with structured drills and shared court practice.",
  },
];

const nusaDutaIndoorCourtUrl = "https://booking.stadiumjohor.my/product/tennis-pusat-kecemerlangan-sukan-johor-nusa-duta/";
const nusaDutaOutdoorCourtUrl = "https://booking.stadiumjohor.my/product/tennis-outdoor-pusat-kecemerlangan-sukan-johor-nusa-duta/";
const jalanDutaCourtUrl = "https://www.stadium.gov.my/sport-recreations/outdoor/tennis.html";
const kualaLumpurStartDate = "2026-10-01";
const trainingAreas = {
  kl: {
    id: "kl",
    name: "Kuala Lumpur",
    slug: "/kuala-lumpur",
    primaryLocation: "Jalan Duta National Tennis Centre",
  },
  jb: {
    id: "jb",
    name: "Johor Bahru",
    slug: "/johor-bahru",
    primaryLocation: "Tennis Nusa Duta",
  },
};

function getServiceById(serviceId) {
  return serviceOptions.find((service) => service.id === serviceId) || null;
}

function getCourtBookingUrl(location, courtOption) {
  if (location === trainingAreas.kl.primaryLocation && courtOption) return jalanDutaCourtUrl;
  if (location !== "Tennis Nusa Duta") return "";
  if (courtOption === "Indoor") return nusaDutaIndoorCourtUrl;
  if (courtOption === "Outdoor") return nusaDutaOutdoorCourtUrl;
  return "";
}

const groupCoachingCapacity = 6;
const groupCoachingFeePerPlayer = 60;
const customerBookingCutoffDate = "2026-09-18";

function getGroupSeatLockId(coachId, date, seatNumber) {
  return `${String(coachId || "group-coaching").replace(/[^a-zA-Z0-9_-]/g, "_")}__${date}__group-seat-${seatNumber}`;
}

function isGroupCoachingBooking(booking) {
  return booking?.coachingFormat === "group" || booking?.serviceType === "group";
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNextTuesdayDate(fromDate = new Date()) {
  const next = new Date(fromDate);
  next.setHours(0, 0, 0, 0);
  const daysUntilTuesday = (2 - next.getDay() + 7) % 7;
  next.setDate(next.getDate() + daysUntilTuesday);
  return formatDate(next);
}

const monthNameMap = {
  jan: 0,
  january: 0,
  januari: 0,
  feb: 1,
  february: 1,
  februari: 1,
  mar: 2,
  march: 2,
  mac: 2,
  apr: 3,
  april: 3,
  may: 4,
  mei: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  julai: 6,
  aug: 7,
  august: 7,
  ogos: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  okt: 9,
  oktober: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
  dis: 11,
  disember: 11,
};

function parseLeaveDateToken(day, month, year) {
  const monthIndex = monthNameMap[String(month || "").toLowerCase()];
  if (monthIndex === undefined) return null;

  const today = new Date();
  const resolvedYear = year ? Number(year) : today.getFullYear();
  return new Date(resolvedYear, monthIndex, Number(day));
}

function normalizeLeaveTime(hourText, minuteText, meridiemText) {
  let hour = Number(hourText);
  const minute = Number(minuteText || 0);
  const meridiem = String(meridiemText || "").toLowerCase();

  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;

  if (!meridiem && hour >= 8 && hour <= 11) {
    hour += 12;
  }

  const date = new Date(2026, 0, 1, hour, minute);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function findNearestTimeSlot(timeText) {
  if (allTimeSlots.includes(timeText)) return timeText;

  const targetDate = new Date(`2026-01-01 ${timeText}`);
  let bestSlot = allTimeSlots[0];
  let bestDistance = Infinity;

  allTimeSlots.forEach((slot) => {
    const slotDate = new Date(`2026-01-01 ${slot}`);
    const distance = Math.abs(slotDate - targetDate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestSlot = slot;
    }
  });

  return bestSlot;
}

function getLeaveDayPattern(lowerText) {
  if (/\b(weekend|weekends|sabtu\s*(dan|&)?\s*ahad|sabtu\s+ahad)\b/.test(lowerText)) {
    return "weekends";
  }

  if (/\b(weekday|weekdays|working days|isnin\s*(hingga|to|-)?\s*jumaat|isnin\s+jumaat)\b/.test(lowerText)) {
    return "weekdays";
  }

  return "all";
}

function matchesLeaveDayPattern(date, pattern = "all") {
  const day = date.getDay();

  if (pattern === "weekdays") return day >= 1 && day <= 5;
  if (pattern === "weekends") return day === 0 || day === 6;

  return true;
}

function parseLeaveRequest(text, options = {}) {
  const input = String(text || "").trim();
  const lower = input.toLowerCase();
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const dayPattern = getLeaveDayPattern(lower);
  const hasRecurringPattern = /\b(setiap|every|daily|hari-hari|weekday|weekdays|weekend|weekends)\b/.test(lower);

  let startDate = null;
  let endDate = null;

  if (/\b(esok|tomorrow)\b/.test(lower)) {
    startDate = tomorrow;
    endDate = tomorrow;
  } else if (/\b(hari ini|today)\b/.test(lower)) {
    startDate = today;
    endDate = today;
  }

  const dateMatches = [...lower.matchAll(/(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?/g)]
    .map((match) => parseLeaveDateToken(match[1], match[2], match[3]))
    .filter(Boolean);

  if (dateMatches.length > 0) {
    startDate = dateMatches[0];
    endDate = dateMatches[dateMatches.length - 1];
  }

  if (!startDate || !endDate) {
    if (hasRecurringPattern && options.defaultStartDate && options.defaultEndDate) {
      startDate = new Date(options.defaultStartDate);
      endDate = new Date(options.defaultEndDate);
    } else {
      return { error: "Could not understand the leave date. Try: cuti esok 4pm sampai 7pm" };
    }
  }

  let startTime = allTimeSlots[0];
  let endTime = allTimeSlots[allTimeSlots.length - 1];

  if (!/\b(full day|sehari|all day)\b/.test(lower)) {
    const timeMatches = [...lower.matchAll(/(?:\b(?:pukul|pkl|jam|at)\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/g)]
      .filter((match) => {
        const matchedText = match[0];
        const hasTimeWord = /\b(pukul|pkl|jam|at)\b/.test(matchedText);
        const hasMeridiem = Boolean(match[3]);
        const hasMinutes = Boolean(match[2]);
        return hasTimeWord || hasMeridiem || hasMinutes;
      });

    if (timeMatches.length >= 2) {
      startTime = findNearestTimeSlot(normalizeLeaveTime(timeMatches[0][1], timeMatches[0][2], timeMatches[0][3]));
      endTime = findNearestTimeSlot(normalizeLeaveTime(timeMatches[1][1], timeMatches[1][2], timeMatches[1][3]));
    } else if (timeMatches.length === 1) {
      startTime = findNearestTimeSlot(normalizeLeaveTime(timeMatches[0][1], timeMatches[0][2], timeMatches[0][3]));
      endTime = startTime;
    }
  }

  return {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
    startTime,
    endTime,
    dayPattern,
    note: input || "Coach leave",
  };
}

function isPastTimeSlot(dateString, timeSlot) {
  const todayString = formatDate(new Date());

  if (dateString !== todayString) return false;

  const now = new Date();
  const slotDate = new Date(`${dateString} ${timeSlot}`);

  return slotDate <= now;
}


function getMonthDays(currentDate) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPadding = firstDay.getDay();
  const days = [];

  for (let i = 0; i < startPadding; i++) days.push(null);
  for (let day = 1; day <= lastDay.getDate(); day++) {
    days.push(new Date(year, month, day));
  }

  return days;
}

const unavailableTextPattern =
  /\b(n\/a|blocked?|emergency|not available|unavailable|manual block)\b/i;
const noteNaPattern = /(^|[^a-z0-9])n\s*\/?\s*a([^a-z0-9]|$)/i;
const dashboardRevenuePerHour = 100;

function parseBookingDate(date) {
  if (date instanceof Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  const dateString = String(date || "").slice(0, 10);
  return dateString ? new Date(`${dateString}T00:00:00`) : null;
}

function containsUnavailableText(value) {
  const text = String(value || "").trim();
  return unavailableTextPattern.test(text) || noteNaPattern.test(text);
}

function isValidCoachingBooking(booking) {
  const fieldsToCheck = [
    booking.name,
    booking.note,
    booking.type,
    booking.status,
    booking.bookingType,
  ];

  return (
    String(booking.bookingStatus || "").trim() === "Confirmed" &&
    String(booking.type || "booking").trim() !== "blocked" &&
    !fieldsToCheck.some(containsUnavailableText)
  );
}

function isReservedBooking(booking) {
  const status = getNormalizedBookingStatus(booking);
  if (["cancelled", "expired"].includes(status)) return false;
  if (status === "pending_confirmation") {
    const expiry = booking.confirmationExpiresAt?.toDate?.() || new Date(booking.confirmationExpiresAt || 0);
    return expiry.getTime() > Date.now();
  }
  return ["confirmed", "completed", "blocked", "not_available"].includes(status);
}

function getNormalizedBookingStatus(booking) {
  return String(booking?.status || booking?.bookingStatus || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function getEndTime(startTime, duration) {
  const startIndex = allTimeSlots.indexOf(startTime);
  const endIndex = startIndex + Math.ceil(Number(duration) || 1);
  return allTimeSlots[endIndex] || "12:00 AM";
}

function getBookingReference(bookingId, date) {
  return `ILHAM-${String(date || "").replaceAll("-", "")}-${String(bookingId).slice(-4).toUpperCase()}`;
}

function getSlotLockId(coachId, date, time) {
  return `${coachId}_${date}_${time}`.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function getBookingDuration(booking) {
  const duration = Number(booking.duration || 1);
  return Number.isFinite(duration) && duration > 0 ? duration : 1;
}

function getBookingSlotCount(booking) {
  return Math.ceil(getBookingDuration(booking));
}

function getHourlyRate(players) {
  return hourlyRates[Number(players)] || hourlyRates[1];
}

function calculateCoachingFee(players, duration) {
  return getHourlyRate(players) * getBookingDuration({ duration });
}

function normalizeStudentName(name) {
  return String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function isPrimaryIlhamCoachName(name) {
  const normalizedName = normalizeStudentName(name).replace(/^coach\s+/, "");
  return ["ilham", "ilham rahman"].includes(normalizedName);
}

const primaryIlhamWhatsAppNumber = "601137507963";

function getCoachWhatsAppNumber(booking) {
  const savedPhone =
    booking?.coachPhone ||
    booking?.coachWhatsapp ||
    booking?.coachWhatsApp ||
    booking?.coachPhoneNumber ||
    booking?.whatsapp ||
    "";

  if (savedPhone) return savedPhone;
  if (isPrimaryIlhamCoachName(booking?.coachName)) return primaryIlhamWhatsAppNumber;
  return "";
}

function getCurrentCustomerCount(bookings) {
  const customerNames = new Set();

  bookings.forEach((booking) => {
    const name = normalizeStudentName(booking.name);

    if (!name) return;
    if (name === "blocked") return;
    if (containsUnavailableText(booking.name) || containsUnavailableText(booking.note)) return;
    if (String(booking.type || booking.bookingType || "").trim().toLowerCase() === "blocked") return;
    if (String(booking.bookingStatus || booking.status || "").trim().toLowerCase() === "cancelled") return;

    customerNames.add(name);
  });

  return customerNames.size;
}

function getPackageOption(packageType) {
  return packageOptions[packageType] || packageOptions["4 Sessions"];
}

function getClientSessions(bookings, packageRecord) {
  const packageCustomerId = String(packageRecord.customerId || "");
  const packageName = normalizeStudentName(packageRecord.clientName || packageRecord.studentName);
  const packagePhone = cleanTableValue(packageRecord.phone);

  return bookings
    .filter((booking) => {
      if (!isValidCoachingBooking(booking)) return false;

      if (packageCustomerId && booking.customerId) {
        return String(booking.customerId) === packageCustomerId;
      }

      const bookingName = normalizeStudentName(booking.name);
      const bookingPhone = cleanTableValue(booking.phone);
      const nameMatches = packageName && bookingName === packageName;
      const phoneMatches = packagePhone && bookingPhone === packagePhone;

      return nameMatches && (!packagePhone || phoneMatches);
    })
    .sort((a, b) => {
      const dateCompare = String(a.date || "").localeCompare(String(b.date || ""));
      if (dateCompare !== 0) return dateCompare;
      return allTimeSlots.indexOf(a.time) - allTimeSlots.indexOf(b.time);
    });
}

function getBookingStartDateTime(booking) {
  const bookingDate = parseBookingDate(booking.date);
  if (!bookingDate) return null;

  const timeValue = String(booking.startTime || booking.time || "").trim();
  if (!timeValue) return bookingDate;
  const parsedTime = new Date(`2026-01-01 ${timeValue}`);
  if (Number.isNaN(parsedTime.getTime())) return bookingDate;

  bookingDate.setHours(parsedTime.getHours(), parsedTime.getMinutes(), 0, 0);
  return bookingDate;
}

function isBookingOnOrBeforeDate(booking, referenceDate = new Date()) {
  const bookingDate = getBookingStartDateTime(booking);
  const compareDate = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);

  if (!bookingDate || Number.isNaN(compareDate.getTime())) return false;

  return bookingDate <= compareDate;
}

function getPackageUsage(bookings, packageRecord) {
  const sessions = getClientSessions(bookings, packageRecord);
  const totalSessions = Number(packageRecord.totalPackageSessions || packageRecord.totalSessions || 0);
  const startSession = Math.max(1, Number(packageRecord.packageStartSessionNumber || 1));
  const parsedPaymentDate = parseBookingDate(packageRecord.paymentDate);
  const paymentDate = parsedPaymentDate && !Number.isNaN(parsedPaymentDate.getTime()) ? parsedPaymentDate : null;
  const packageSessions = paymentDate
    ? sessions.filter((booking) => {
        const bookingDate = getBookingStartDateTime(booking);
        return bookingDate && bookingDate >= paymentDate;
      })
    : sessions.slice(startSession - 1);
  const attendedPackageSessions = packageSessions.filter((booking) => isBookingOnOrBeforeDate(booking));
  const usedSessions = attendedPackageSessions.reduce((total, booking) => {
    return total + getBookingDuration(booking);
  }, 0);

  return {
    totalClientSessions: sessions.length,
    attendedClientSessions: sessions.filter((booking) => isBookingOnOrBeforeDate(booking)).length,
    usedSessions,
    remainingSessions: Math.max(0, totalSessions - usedSessions),
  };
}

function matchesClientIdentity(booking, client) {
  const clientPhone = normalizePhoneNumber(client.phone);
  const bookingPhone = normalizePhoneNumber(booking.customerPhone || booking.phone);
  const clientName = normalizeStudentName(client.clientName || client.studentName || client.name);
  const bookingName = normalizeStudentName(booking.name);

  if (clientPhone && bookingPhone) return clientPhone === bookingPhone;

  return Boolean(clientName && bookingName && clientName === bookingName);
}

function getClientBookingHistory(bookings, client) {
  return bookings
    .filter((booking) => {
      if (!matchesClientIdentity(booking, client)) return false;
      if (String(booking.type || booking.bookingType || "").toLowerCase() === "blocked") return false;
      if (String(booking.name || "").trim().toLowerCase() === "blocked") return false;
      if (containsUnavailableText(booking.name) || containsUnavailableText(booking.note)) return false;

      return true;
    })
    .sort((a, b) => {
      const dateCompare = String(b.date || "").localeCompare(String(a.date || ""));
      if (dateCompare !== 0) return dateCompare;
      return allTimeSlots.indexOf(b.time) - allTimeSlots.indexOf(a.time);
    });
}

function isCountedStudentSession(booking) {
  return ["confirmed", "completed"].includes(
    String(booking.bookingStatus || booking.status || "").trim().toLowerCase()
  );
}

function getBookingRevenue(booking) {
  return getBookingDuration(booking) * dashboardRevenuePerHour;
}

function getPeriodRange(period, referenceDate = new Date()) {
  const reference = parseBookingDate(referenceDate) || new Date();
  const start = new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate()
  );
  const end = new Date(start);

  if (period === "week") {
    const day = start.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + mondayOffset);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 7);
  }

  if (period === "month") {
    start.setDate(1);
    end.setTime(start.getTime());
    end.setMonth(start.getMonth() + 1, 1);
  }

  if (period === "year") {
    start.setMonth(0, 1);
    end.setTime(start.getTime());
    end.setFullYear(start.getFullYear() + 1, 0, 1);
  }

  return { start, end };
}

function getExpandedBookingSlots(bookings, range, bookingFilter) {
  const slotsByCell = new Map();

  bookings.forEach((booking, bookingIndex) => {
    if (!bookingFilter(booking)) return;

    const bookingDate = parseBookingDate(booking.date);
    if (!bookingDate) return;
    if (range && (bookingDate < range.start || bookingDate >= range.end)) return;

    const dateString = formatDate(bookingDate);
    const startIndex = allTimeSlots.indexOf(String(booking.startTime || booking.time || "").trim());
    if (startIndex === -1) return;

    const duration = getBookingSlotCount(booking);

    for (let i = 0; i < duration; i++) {
      const time = allTimeSlots[startIndex + i];
      if (!time) continue;

      const slotKey = `${dateString}-${time}`;
      if (!slotsByCell.has(slotKey)) {
        slotsByCell.set(slotKey, {
          booking,
          bookingIndex,
          date: dateString,
          time,
        });
      }
    }
  });

  return Array.from(slotsByCell.values());
}

function getExpandedValidBookingSlots(bookings, range) {
  return getExpandedBookingSlots(bookings, range, isValidCoachingBooking);
}

function getExpandedReservedSlots(bookings, range) {
  return getExpandedBookingSlots(bookings, range, isReservedBooking);
}

function getRequestedSlotKeys(date, time, duration) {
  const startIndex = allTimeSlots.indexOf(String(time || "").trim());
  if (startIndex === -1) return [];

  return Array.from({ length: getBookingSlotCount({ duration }) }, (_, index) => {
    const slot = allTimeSlots[startIndex + index];
    return slot ? `${date}-${slot}` : null;
  }).filter(Boolean);
}

function getAvailabilityLockTime(lock) {
  const date = String(lock?.date || "").trim();
  const storedTime = String(lock?.time || "").trim();
  const legacyPrefix = date ? `${date}-` : "";

  return legacyPrefix && storedTime.startsWith(legacyPrefix)
    ? storedTime.slice(legacyPrefix.length)
    : storedTime;
}

function hasBookingOverlap(bookings, date, time, duration) {
  const requestedSlotKeys = getRequestedSlotKeys(date, time, duration);
  if (requestedSlotKeys.length !== getBookingSlotCount({ duration })) return true;

  const dayRange = {
    start: parseBookingDate(date),
    end: parseBookingDate(date),
  };
  dayRange.end.setDate(dayRange.end.getDate() + 1);

  const reservedSlotKeys = new Set(
    getExpandedReservedSlots(bookings, dayRange).map(
      (slot) => `${slot.date}-${slot.time}`
    )
  );

  return requestedSlotKeys.some((slotKey) => reservedSlotKeys.has(slotKey));
}

function getBookingStats(bookings, period, referenceDate) {
  const range = getPeriodRange(period, referenceDate);
  const validSlots = getExpandedValidBookingSlots(bookings, range);
  const validBookingsByIndex = new Map(
    validSlots.map((slot) => [slot.bookingIndex, slot.booking])
  );
  const validBookings = Array.from(validBookingsByIndex.values());

  return {
    totalBookings: validBookings.length,
    totalHours: validBookings.reduce((total, booking) => {
      return total + getBookingDuration(booking);
    }, 0),
    estimatedRevenue: validBookings.reduce((total, booking) => {
      return total + getBookingRevenue(booking);
    }, 0),
  };
}

function formatStatsDate(date) {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatStatsMonth(date) {
  return date.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

function getScheduleCellText(booking) {
  if (!booking) return "";
  if (isUnavailableBooking(booking)) return "";
  return booking.name || booking.note || "Booked";
}

function isUnavailableBooking(booking) {
  if (!booking) return false;

  const type = String(booking.type || booking.bookingType || "").trim().toLowerCase();
  const status = String(booking.bookingStatus || booking.status || "").trim().toLowerCase();

  return (
    type === "blocked" ||
    status === "blocked" ||
    containsUnavailableText(booking.name) ||
    containsUnavailableText(booking.note) ||
    containsUnavailableText(booking.type) ||
    containsUnavailableText(booking.bookingType)
  );
}

function getUserRole(userProfile) {
  return userProfile?.role || roles.VIEWER;
}

function getCoachDisplayName(value) {
  const name = String(value || "").trim();
  return name.toLowerCase() === "muhammad rafie" ? "Coach Rafie" : name;
}

function normalizeCoachDisplayFields(record) {
  if (!record) return record;
  return {
    ...record,
    coachName: getCoachDisplayName(record.coachName),
    fromCoachName: getCoachDisplayName(record.fromCoachName),
    toCoachName: getCoachDisplayName(record.toCoachName),
    updatedByName: getCoachDisplayName(record.updatedByName),
  };
}

function getCoachName(user, userProfile) {
  return getCoachDisplayName(userProfile?.coachName || user?.displayName || user?.email || "Coach");
}

function getCoachId(user, userProfile) {
  return userProfile?.coachId || user?.uid || "";
}

function getCoachEmail(user, userProfile) {
  return userProfile?.coachEmail || user?.email || "";
}

function canEditAdminData(userProfile) {
  return (
    [roles.SUPER_ADMIN, roles.COACH].includes(getUserRole(userProfile)) &&
    String(userProfile?.status || "active") === "active"
  );
}

function canViewBookingForAdmin(booking, user, userProfile, selectedCoach) {
  const role = getUserRole(userProfile);
  const bookingCoachId = String(booking.coachId || booking.createdBy || "");
  const bookingCoachName = booking.coachName || "";
  const ownCoachId = getCoachId(user, userProfile);
  const ownCoachName = getCoachName(user, userProfile);

  if (role === roles.SUPER_ADMIN) {
    if (!selectedCoach) return false;
    const selectedOwnCoach = selectedCoach === ownCoachId;
    const selectedPrimaryIlham = selectedOwnCoach && isPrimaryIlhamCoachName(ownCoachName);

    if (bookingCoachId) {
      return (
        bookingCoachId === selectedCoach ||
        (selectedPrimaryIlham && isPrimaryIlhamCoachName(bookingCoachName))
      );
    }

    return selectedOwnCoach || selectedPrimaryIlham;
  }

  return Boolean(user?.uid) && (
    bookingCoachId === user.uid ||
    bookingCoachId === userProfile?.coachId ||
    (!bookingCoachId && normalizeStudentName(bookingCoachName) === normalizeStudentName(ownCoachName))
  );
}

function getBookingCoachLabel(booking) {
  return getCoachDisplayName(booking.coachName || booking.coachEmail || "Unknown coach");
}

function cleanTableValue(value) {
  const text = String(value || "").trim();
  return text.toLowerCase() === "#error!" ? "" : text;
}

function normalizePhoneNumber(value) {
  const rawValue = cleanTableValue(value);
  const digits = rawValue.replace(/\D/g, "");
  if (!digits) return "";
  if (rawValue.trim().startsWith("+")) return digits;
  if (rawValue.trim().startsWith("00")) return digits.slice(2);
  if (digits.startsWith("60")) return digits;
  if (digits.startsWith("0")) return `60${digits.slice(1)}`;
  return `60${digits}`;
}

function getBookingWhatsAppMessage(booking) {
  return [
    "A customer submitted a new tennis coaching booking request.",
    "",
    `Customer: ${booking.customerName || booking.name || "-"}`,
    `Phone: ${booking.customerPhone || booking.phone || "-"}`,
    `Email: ${booking.customerEmail || "-"}`,
    `Coach: ${booking.coachName || "-"}`,
    `Date: ${booking.date || "-"}`,
    `Time: ${booking.startTime || booking.time || "-"}`,
    `Duration: ${booking.durationHours || booking.duration || "-"} hour(s)`,
    `Location: ${booking.location || "-"}`,
    `Court: ${booking.courtOption || booking.court || "-"}`,
    "",
    "Please open the coach dashboard to review the request.",
  ].join("\n");
}

function getWhatsAppBookingUrl(phone, booking) {
  const normalizedPhone = normalizePhoneNumber(phone);
  return normalizedPhone ? `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(getBookingWhatsAppMessage(booking))}` : "";
}

function getBundleWhatsAppMessage(bookings) {
  const sessions = [...bookings].sort((a, b) => Number(a.bundleIndex || 0) - Number(b.bundleIndex || 0));
  const first = sessions[0] || {};
  return [
    "A customer submitted a tennis coaching bundle request.",
    "",
    `Customer: ${first.customerName || first.name || "-"}`,
    `Phone: ${first.customerPhone || first.phone || "-"}`,
    `Email: ${first.customerEmail || "-"}`,
    `Coach: ${first.coachName || "-"}`,
    `Bundle: ${first.bundleReference || first.bundleId || "-"}`,
    `Sessions: ${sessions.length}`,
    "",
    ...sessions.map((session, index) => `${index + 1}. ${session.date} · ${session.startTime || session.time} · ${session.durationHours || session.duration} hour(s) · ${session.location}${session.courtOption || session.court ? ` (${session.courtOption || session.court})` : ""}`),
    "",
    "Please open the coach dashboard to review the request.",
  ].join("\n");
}

function getBundleWhatsAppUrl(phone, bookings) {
  const normalizedPhone = normalizePhoneNumber(phone);
  return normalizedPhone ? `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(getBundleWhatsAppMessage(bookings))}` : "";
}

function findMatchingCustomer(customers, record) {
  if (record?.customerId) {
    const linkedCustomer = customers.find((customer) => customer.id === record.customerId || customer.uid === record.customerId);
    if (linkedCustomer) return linkedCustomer;
  }

  const phone = normalizePhoneNumber(record?.customerPhone || record?.phone);
  const name = normalizeStudentName(record?.customerName || record?.clientName || record?.studentName || record?.name);
  const phoneMatches = phone ? customers.filter((customer) => normalizePhoneNumber(customer.phone) === phone) : [];
  if (phoneMatches.length === 1) return phoneMatches[0];
  const nameMatches = name ? customers.filter((customer) => normalizeStudentName(customer.fullName || customer.name) === name) : [];
  return nameMatches.length === 1 ? nameMatches[0] : null;
}

function formatNotificationDate(createdAt) {
  const date = createdAt?.toDate ? createdAt.toDate() : null;
  if (!date) return "";

  return date.toLocaleString("en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getAdminLoginEmail(loginName) {
  const value = String(loginName || "").trim();
  if (value.includes("@")) return value;
  return `${value.toLowerCase()}@ilham-booking.local`;
}

function getDefaultAdminProfile(user) {
  const email = String(user?.email || "").toLowerCase();
  const username = email.split("@")[0] || "coach";

  if (email === "ilham@ilham-booking.local") {
    return {
      role: roles.SUPER_ADMIN,
      coachId: user?.uid || "",
      coachName: "ILHAM",
      coachEmail: email,
    };
  }

  if (email === "zayn@ilham-booking.local") {
    return {
      role: roles.COACH,
      coachId: user?.uid || "",
      coachName: "zayn",
      coachEmail: email,
    };
  }

  if (email === "khalis@ilham-booking.local") {
    return {
      role: roles.COACH,
      coachId: user?.uid || "",
      coachName: "khalis",
      coachEmail: email,
    };
  }

  return {
    role: roles.VIEWER,
    coachId: user?.uid || "",
    coachName: user?.displayName || username,
    coachEmail: email,
  };
}

function WeeklySchedule({
  bookings,
  selectedDate,
  onSelectDate,
  className = "mt-8",
  contentClassName = "",
  editable = false,
  hideBookingNames = false,
  onSaveCell,
}) {
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [savingCellKey, setSavingCellKey] = useState("");

  const { weekDays, slotBookingsByKey } = useMemo(() => {
    const weekRange = getPeriodRange("week", selectedDate);
    const expandedSlots = getExpandedReservedSlots(bookings, weekRange);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekRange.start);
      d.setDate(weekRange.start.getDate() + i);
      return d;
    });

    return {
      weekDays: days,
      slotBookingsByKey: new Map(
        expandedSlots.map((slot) => [`${slot.date}-${slot.time}`, slot.booking])
      ),
    };
  }, [bookings, selectedDate]);

  function getBooking(date, time) {
    const dateString = formatDate(date);
    return slotBookingsByKey.get(`${dateString}-${time}`);
  }

  function getCellKey(dateString, time) {
    return `${dateString}-${time}`;
  }

  function startEditing(dateString, time, booking) {
    if (!editable) return;

    onSelectDate(dateString);
    setEditingCell({ date: dateString, time, booking });
    setEditValue(getScheduleCellText(booking));
  }

  function cancelEditing() {
    setEditingCell(null);
    setEditValue("");
  }

  async function saveCell(cell = editingCell, value = editValue) {
    if (!editable || !cell || !onSaveCell) return;

    const cellKey = getCellKey(cell.date, cell.time);
    setSavingCellKey(cellKey);

    try {
      await onSaveCell({ ...cell, value });
    } catch (error) {
      console.error(error);
      alert("Failed to save schedule cell.");
    } finally {
      setSavingCellKey("");
      cancelEditing();
    }
  }

  function isEditingCell(dateString, time) {
    return (
      editingCell?.date === dateString &&
      editingCell?.time === time
    );
  }

  return (
    <div className={`bg-neutral-900 border border-neutral-800 rounded-3xl p-6 md:p-8 ${className}`}>
      <div className="premium-schedule-heading">
        <h2 className="text-2xl font-semibold">Weekly Schedule</h2>
        <div className="premium-schedule-legend" aria-label="Weekly schedule colour guide">
          <div><span className="is-available" aria-hidden="true" /><span><strong>Available</strong><small>Open coaching slot</small></span></div>
          <div><span className="is-booked" aria-hidden="true" /><span><strong>Reserved</strong><small>Already booked</small></span></div>
          <div><span className="is-blocked" aria-hidden="true" /><span><strong>Unavailable</strong><small>Not open for booking</small></span></div>
          <div><span className="is-past" aria-hidden="true" /><span><strong>Past time</strong><small>No longer bookable</small></span></div>
        </div>
      </div>

     <div className={`overflow-auto max-w-full ${contentClassName}`}>
        <div className="min-w-[900px]">
          <div className="grid grid-cols-8 bg-purple-400/70 text-black rounded-t-2xl overflow-hidden">
            <div className="p-3 font-semibold">Time</div>

            {weekDays.map((day) => (
              <button
                key={formatDate(day)}
                onClick={() => onSelectDate(formatDate(day))}
                className="p-3 text-center font-semibold hover:bg-lime-300"
              >
                <div>{day.toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}</div>
                <div className="text-xs uppercase">
                  {day.toLocaleDateString("en-US", { weekday: "long" })}
                </div>
              </button>
            ))}
          </div>

          {allTimeSlots.map((slot, index) => (
            <div
              key={slot}
              className={`grid grid-cols-8 border-b border-neutral-800 ${index % 2 === 0 ? "bg-neutral-950" : "bg-neutral-900"
                }`}
            >
              <div className="p-3 text-sm text-neutral-300 border-r border-neutral-800">
                {slot}
              </div>

              {weekDays.map((day) => {
                const dateString = formatDate(day);
                const booking = getBooking(day, slot);
                const cellKey = getCellKey(dateString, slot);
                const isPastSlot = isPastTimeSlot(dateString, slot);
                const shouldDimPast = isPastSlot && !editable;
                const isEditing = isEditingCell(dateString, slot);
                const isSaving = savingCellKey === cellKey;
                const isUnavailableCell = isUnavailableBooking(booking);
                const cellText = getScheduleCellText(booking);
                const cellClassName = `relative min-h-14 p-3 text-left text-sm border-r border-neutral-800 transition ${shouldDimPast
                  ? "opacity-30 cursor-not-allowed text-neutral-600 bg-neutral-950"
                  : isUnavailableCell
                  ? "bg-neutral-700/80 text-transparent"
                  : booking
                  ? "text-black bg-lime-400 font-semibold"
                  : "text-neutral-500 hover:bg-neutral-800"
                }`;

                if (editable && isEditing) {
                  return (
                    <div key={`${dateString}-${slot}`} className={cellClassName}>
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => saveCell()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.currentTarget.blur();
                          }

                          if (e.key === "Escape") {
                            e.preventDefault();
                            cancelEditing();
                          }
                        }}
                        className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-white outline-none focus:border-lime-300"
                      />
                    </div>
                  );
                }

                if (editable) {
                  return (
                    <div
                      key={`${dateString}-${slot}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => startEditing(dateString, slot, booking)}
                      onDoubleClick={() => startEditing(dateString, slot, booking)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (booking) saveCell({ date: dateString, time: slot, booking }, "");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          startEditing(dateString, slot, booking);
                        }
                      }}
                      className={`${cellClassName} cursor-text`}
                    >
                      <span>{isUnavailableCell ? "" : isSaving ? "Saving..." : cellText}</span>
                      {booking && !isUnavailableCell && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            saveCell({ date: dateString, time: slot, booking }, "");
                          }}
                          className="absolute right-1 top-1 rounded-full bg-black/20 px-1.5 py-0.5 text-xs text-black hover:bg-black/30"
                          aria-label="Clear schedule cell"
                        >
                          x
                        </button>
                      )}
                    </div>
                  );
                }

                return (
                  <button
                    key={`${dateString}-${slot}`}
                    onClick={() => {
                      onSelectDate(dateString);
                    }}
                    className={cellClassName}
                    aria-label={booking ? "Booked slot" : "Available slot"}
                  >
                    {shouldDimPast || isUnavailableCell || (booking && hideBookingNames)
                      ? ""
                      : cellText}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PackageTracker({ packages, bookings, customers, canEdit, user, userProfile }) {
  const [editingPackageId, setEditingPackageId] = useState("");
  const [editPackage, setEditPackage] = useState({});
  const [newPackage, setNewPackage] = useState({
    customerId: "",
    customerEmail: "",
    clientName: "",
    phone: "",
    packageType: "8 Sessions",
    packageStartSessionNumber: 1,
    totalPackageSessions: 8,
    paymentDate: formatDate(new Date()),
    paymentAmount: 800,
    paymentStatus: "Paid",
    notes: "",
  });

  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const [showStudentSuggestions, setShowStudentSuggestions] = useState(false);
  const [packageStatus, setPackageStatus] = useState("");

  const studentSuggestions = useMemo(() => {
    const query = studentSearchQuery.trim().toLowerCase();
    if (query.length < 1) return [];

    const studentsByKey = new Map();

    bookings.forEach((booking) => {
      if (!isValidCoachingBooking(booking)) return;

      const clientName = String(booking.name || "").trim();
      const phone = cleanTableValue(booking.phone);
      if (!clientName && !phone) return;

      const key = phone || normalizeStudentName(clientName);
      const current = studentsByKey.get(key) || {
        customerId: booking.customerId || "",
        customerEmail: booking.customerEmail || "",
        clientName,
        phone,
        totalSessions: 0,
      };

      current.clientName = current.clientName || clientName;
      current.phone = current.phone || phone;
      current.customerId = current.customerId || booking.customerId || "";
      current.customerEmail = current.customerEmail || booking.customerEmail || "";
      if (isBookingOnOrBeforeDate(booking)) {
        current.totalSessions += getBookingDuration(booking);
      }
      studentsByKey.set(key, current);
    });

    return Array.from(studentsByKey.values())
      .filter((student) => {
        const name = student.clientName.toLowerCase();
        const phone = student.phone.toLowerCase();
        return name.includes(query) || phone.includes(query);
      })
      .sort((a, b) => {
        const aPhoneMatch = a.phone.toLowerCase().includes(query) ? 0 : 1;
        const bPhoneMatch = b.phone.toLowerCase().includes(query) ? 0 : 1;
        if (aPhoneMatch !== bPhoneMatch) return aPhoneMatch - bPhoneMatch;
        return a.clientName.localeCompare(b.clientName);
      })
      .slice(0, 8);
  }, [bookings, studentSearchQuery]);

  const selectedStudentTotalSessions = useMemo(() => {
    return getClientSessions(bookings, newPackage)
      .filter((booking) => isBookingOnOrBeforeDate(booking))
      .reduce((total, booking) => {
        return total + getBookingDuration(booking);
      }, 0);
  }, [bookings, newPackage]);

  function findMatchingPackage(clientName, phone) {
    const normalizedName = normalizeStudentName(clientName);
    const normalizedPhone = normalizePhoneNumber(phone);
    const selectedCustomerId = newPackage.customerId || "";

    return packages.find((packageRecord) => {
      if (selectedCustomerId && packageRecord.customerId) return packageRecord.customerId === selectedCustomerId;
      const packageName = normalizeStudentName(packageRecord.clientName || packageRecord.studentName);
      const packagePhone = normalizePhoneNumber(packageRecord.phone);
      if (normalizedPhone && packagePhone) return packagePhone === normalizedPhone;
      return normalizedName && packageName === normalizedName;
    }) || null;
  }

  function getPackageFormFromRecord(packageRecord) {
    return {
      packageType: packageRecord.packageType || "8 Sessions",
      packageStartSessionNumber: packageRecord.packageStartSessionNumber || 1,
      totalPackageSessions: packageRecord.totalPackageSessions || packageRecord.totalSessions || 8,
      paymentDate: packageRecord.paymentDate || formatDate(new Date()),
      paymentAmount: packageRecord.paymentAmount || getPackageOption(packageRecord.packageType || "8 Sessions").paymentAmount,
      paymentStatus: packageRecord.paymentStatus || "Paid",
      notes: packageRecord.notes || "",
    };
  }

  function inferPackageCustomerId(packageRecord) {
    if (packageRecord.customerId) return packageRecord.customerId;
    const matchedCustomer = findMatchingCustomer(customers, packageRecord);
    if (matchedCustomer) return matchedCustomer.id || matchedCustomer.uid || "";
    const linkedIds = new Set(
      bookings
        .filter((booking) => booking.customerId && matchesClientIdentity(booking, {
          name: packageRecord.clientName || packageRecord.studentName,
          phone: packageRecord.phone,
        }))
        .map((booking) => booking.customerId)
    );
    return linkedIds.size === 1 ? [...linkedIds][0] : "";
  }

  function selectStudentSuggestion(student) {
    const existingPackage = findMatchingPackage(student.clientName, student.phone);

    setNewPackage((current) => ({
      ...current,
      customerId: student.customerId || current.customerId || "",
      customerEmail: student.customerEmail || current.customerEmail || "",
      clientName: student.clientName,
      phone: student.phone,
      packageStartSessionNumber: existingPackage?.packageStartSessionNumber || Math.max(1, student.totalSessions + 1),
      ...(existingPackage ? getPackageFormFromRecord(existingPackage) : {}),
    }));
    setStudentSearchQuery(`${student.clientName} ${student.phone}`.trim());
    setShowStudentSuggestions(false);
  }

  function updateStudentSearch(field, value) {
    setNewPackage((current) => ({ ...current, [field]: value }));
    setStudentSearchQuery(value);
    setShowStudentSuggestions(value.trim().length > 0);
    setPackageStatus("");
  }

  function hideStudentSuggestionsSoon() {
    window.setTimeout(() => setShowStudentSuggestions(false), 120);
  }
  function applyPackageType(packageType, setter) {
    const option = getPackageOption(packageType);
    setter((current) => ({
      ...current,
      packageType,
      totalPackageSessions:
        packageType === "Custom"
          ? current.totalPackageSessions || option.totalSessions
          : option.totalSessions,
      paymentAmount:
        packageType === "Custom"
          ? current.paymentAmount || option.paymentAmount
          : option.paymentAmount,
    }));
  }

  function startEditPackage(packageRecord) {
    setEditingPackageId(packageRecord.id);
    setEditPackage({
      customerId: inferPackageCustomerId(packageRecord),
      clientName: packageRecord.clientName || packageRecord.studentName || "",
      phone: cleanTableValue(packageRecord.phone),
      packageType: packageRecord.packageType || "8 Sessions",
      packageStartSessionNumber: packageRecord.packageStartSessionNumber || 1,
      totalPackageSessions: packageRecord.totalPackageSessions || packageRecord.totalSessions || 8,
      paymentDate: packageRecord.paymentDate || "",
      paymentAmount: packageRecord.paymentAmount || 0,
      paymentStatus: packageRecord.paymentStatus || "Unpaid",
      notes: packageRecord.notes || "",
    });
  }

  function selectCustomer(customerId, setter) {
    const customer = customers.find((item) => item.id === customerId || item.uid === customerId);
    setter((current) => ({
      ...current,
      customerId: customerId || "",
      ...(customer ? { clientName: customer.fullName || customer.name || current.clientName, phone: customer.phone || current.phone } : {}),
    }));
  }

  async function savePackage(packageRecord) {
    const clientName = String(editPackage.clientName || "").trim();
    const totalPackageSessions = Math.max(0, Number(editPackage.totalPackageSessions || 0));
    const packageStartSessionNumber = Math.max(1, Number(editPackage.packageStartSessionNumber || 1));

    if (!clientName) {
      alert("Client name is required.");
      return;
    }

    const linkedCustomer = findMatchingCustomer(customers, { ...editPackage, clientName });
    await updateDoc(doc(db, "packages", packageRecord.id), {
      customerId: linkedCustomer?.id || linkedCustomer?.uid || editPackage.customerId || packageRecord.customerId || "",
      customerEmail: linkedCustomer?.email || packageRecord.customerEmail || "",
      clientName,
      studentName: clientName,
      phone: cleanTableValue(editPackage.phone),
      packageType: editPackage.packageType,
      packageLabel: getPackageOption(editPackage.packageType).label,
      packageStartSessionNumber,
      totalPackageSessions,
      totalSessions: totalPackageSessions,
      paymentDate: editPackage.paymentDate || "",
      paymentAmount: Number(editPackage.paymentAmount || 0),
      paymentStatus: editPackage.paymentStatus,
      notes: editPackage.notes || "",
      updatedBy: user?.uid || "",
      updatedByName: getCoachName(user, userProfile),
      updateMessage: "Coach updated your package details.",
      updatedAt: serverTimestamp(),
    });

    setEditingPackageId("");
    setEditPackage({});
  }

  async function createPackage() {
    const clientName = String(newPackage.clientName || "").trim();
    const totalPackageSessions = Math.max(0, Number(newPackage.totalPackageSessions || 0));
    const packageStartSessionNumber = Math.max(1, Number(newPackage.packageStartSessionNumber || 1));

    setShowStudentSuggestions(false);

    if (!clientName) {
      setPackageStatus("Client name is required.");
      return;
    }

    try {
      setPackageStatus("Saving package...");

      const linkedCustomer = findMatchingCustomer(customers, { ...newPackage, clientName });
      const packageData = {
        customerId: linkedCustomer?.id || linkedCustomer?.uid || newPackage.customerId || "",
        customerEmail: linkedCustomer?.email || newPackage.customerEmail || "",
        clientName,
        studentName: clientName,
        phone: cleanTableValue(newPackage.phone),
        packageType: newPackage.packageType,
        packageLabel: getPackageOption(newPackage.packageType).label,
        packageStartSessionNumber,
        totalPackageSessions,
        totalSessions: totalPackageSessions,
        paymentDate: newPackage.paymentDate || "",
        paymentAmount: Number(newPackage.paymentAmount || 0),
        paymentStatus: newPackage.paymentStatus || "Paid",
        notes: newPackage.notes || "",
        status: "active",
        coachId: getCoachId(user, userProfile),
        coachName: getCoachName(user, userProfile),
        coachEmail: getCoachEmail(user, userProfile),
        role: getUserRole(userProfile),
        updatedBy: user?.uid || "",
        updatedByName: getCoachName(user, userProfile),
        updateMessage: "Coach assigned or updated your package.",
        updatedAt: serverTimestamp(),
      };
      const existingPackage = findMatchingPackage(clientName, newPackage.phone);

      if (existingPackage) {
        await updateDoc(doc(db, "packages", existingPackage.id), packageData);
        setPackageStatus("Existing package updated.");
      } else {
        await addDoc(collection(db, "packages"), {
          ...packageData,
          createdBy: user?.uid || "",
          createdAt: serverTimestamp(),
        });
        setPackageStatus("Package added.");
      }

      setNewPackage({
        customerId: "",
        customerEmail: "",
        clientName: "",
        phone: "",
        packageType: "8 Sessions",
        packageStartSessionNumber: 1,
        totalPackageSessions: 8,
        paymentDate: formatDate(new Date()),
        paymentAmount: 800,
        paymentStatus: "Paid",
        notes: "",
      });
      setStudentSearchQuery("");
    } catch (error) {
      console.error(error);
      setPackageStatus(`Package save failed: ${error.message || "Please check Firestore rules."}`);
    }
  }

  async function markPackagePaid(packageRecord) {
    await updateDoc(doc(db, "packages", packageRecord.id), {
      paymentStatus: "Paid",
      paymentDate: packageRecord.paymentDate || formatDate(new Date()),
      updatedBy: user?.uid || "",
      updatedByName: getCoachName(user, userProfile),
      updateMessage: "Coach updated your package payment status.",
      updatedAt: serverTimestamp(),
    });
  }

  async function deletePackage(packageRecord) {
    if (!window.confirm(`Delete package for ${packageRecord.clientName || packageRecord.studentName}?`)) return;
    await deleteDoc(doc(db, "packages", packageRecord.id));
  }

  return (
    <div className="mt-8 bg-neutral-900 border border-neutral-800 rounded-3xl p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Package Tracker</h2>
          <p className="mt-2 text-neutral-400">
            Mark client packages from admin only. Usage is calculated from client bookings by name and phone.
          </p>
        </div>
      </div>

      {canEdit && (
        <div className="mt-5 grid grid-cols-1 gap-3 rounded-2xl border border-neutral-800 bg-neutral-950 p-4 md:grid-cols-4">
          <select value={newPackage.customerId} onChange={(e) => selectCustomer(e.target.value, setNewPackage)} className="rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2 md:col-span-4">
            <option value="">Auto-link by exact phone or name</option>
            {newPackage.customerId && !customers.some((customer) => customer.id === newPackage.customerId) && <option value={newPackage.customerId}>Linked customer from booking</option>}
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.fullName || customer.name || customer.email} · {customer.phone || customer.email}</option>)}
          </select>
          <div className="relative md:col-span-2" onBlur={hideStudentSuggestionsSoon}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input value={newPackage.clientName} onFocus={() => setShowStudentSuggestions(studentSearchQuery.trim().length > 0)} onChange={(e) => updateStudentSearch("clientName", e.target.value)} placeholder="Client name" className="rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2" />
              <input value={newPackage.phone} onFocus={() => setShowStudentSuggestions(studentSearchQuery.trim().length > 0)} onChange={(e) => updateStudentSearch("phone", e.target.value)} placeholder="Phone number" className="rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2" />
            </div>
            {showStudentSuggestions && studentSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-neutral-700 bg-neutral-950 shadow-2xl">
                {studentSuggestions.map((student) => (
                  <button
                    key={`${student.phone || student.clientName}-${student.clientName}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectStudentSuggestion(student)}
                    className="flex w-full items-center justify-between gap-4 border-b border-neutral-800 px-4 py-3 text-left hover:bg-neutral-800"
                  >
                    <span>
                      <span className="block font-semibold text-white">{student.clientName}</span>
                      <span className="block text-xs text-neutral-400">{student.phone || "No phone"}</span>
                    </span>
                    <span className="text-xs text-lime-300">{student.totalSessions} attended</span>
                  </button>
                ))}
              </div>
            )}
            {selectedStudentTotalSessions > 0 && (
              <p className="mt-2 text-xs text-neutral-400">Existing attended sessions: {selectedStudentTotalSessions}</p>
            )}
          </div>
          <select value={newPackage.packageType} onChange={(e) => applyPackageType(e.target.value, setNewPackage)} className="rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2">
            {Object.keys(packageOptions).map((packageType) => <option key={packageType} value={packageType}>{packageType}</option>)}
          </select>
          <input type="number" min="1" step="1" value={newPackage.packageStartSessionNumber} onChange={(e) => setNewPackage((current) => ({ ...current, packageStartSessionNumber: e.target.value }))} placeholder="Fallback start session" title="Used only when no payment date is set" className="rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2" />
          <input type="number" min="0" step="0.5" value={newPackage.totalPackageSessions} onChange={(e) => setNewPackage((current) => ({ ...current, totalPackageSessions: e.target.value }))} placeholder="Total sessions" className="rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2" />
          <input type="date" value={newPackage.paymentDate} onChange={(e) => setNewPackage((current) => ({ ...current, paymentDate: e.target.value }))} className="rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2" />
          <input type="number" min="0" step="1" value={newPackage.paymentAmount} onChange={(e) => setNewPackage((current) => ({ ...current, paymentAmount: e.target.value }))} placeholder="Payment amount" className="rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2" />
          <select value={newPackage.paymentStatus} onChange={(e) => setNewPackage((current) => ({ ...current, paymentStatus: e.target.value }))} className="rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2">
            <option>Paid</option>
            <option>Unpaid</option>
            <option>Partial</option>
          </select>
          <textarea value={newPackage.notes} onChange={(e) => setNewPackage((current) => ({ ...current, notes: e.target.value }))} placeholder="Notes" className="rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2 md:col-span-3" />
          <button type="button" onMouseDown={() => setShowStudentSuggestions(false)} onClick={createPackage} className="rounded-xl bg-lime-400 px-4 py-2 font-semibold text-black">Add Package</button>
          {packageStatus && <p className="text-sm text-neutral-300 md:col-span-4">{packageStatus}</p>}
        </div>
      )}

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[1200px] text-sm">
          <thead className="text-neutral-400">
            <tr>
              <th className="p-3 text-left">Client</th>
              <th className="p-3 text-left">Customer Account</th>
              <th className="p-3 text-left">Phone</th>
              <th className="p-3 text-left">Attended Sessions</th>
              <th className="p-3 text-left">Package</th>
              <th className="p-3 text-left">Counting From</th>
              <th className="p-3 text-left">Used / Total</th>
              <th className="p-3 text-left">Remaining</th>
              <th className="p-3 text-left">Payment</th>
              <th className="p-3 text-left">Notes</th>
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {packages.map((packageRecord) => {
              const isEditing = editingPackageId === packageRecord.id;
              const usage = getPackageUsage(bookings, packageRecord);
              const totalPackageSessions = Number(packageRecord.totalPackageSessions || packageRecord.totalSessions || 0);
              const clientName = packageRecord.clientName || packageRecord.studentName || "";
              const paymentAmount = Number(packageRecord.paymentAmount || 0);
              const linkedCustomer = findMatchingCustomer(customers, packageRecord);

              return (
                <tr key={packageRecord.id} className="border-t border-neutral-800">
                  <td className="p-3">{isEditing ? <input value={editPackage.clientName} onChange={(e) => setEditPackage((current) => ({ ...current, clientName: e.target.value }))} className="w-full rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2" /> : clientName}</td>
                  <td className="p-3">{isEditing ? <select value={editPackage.customerId || ""} onChange={(e) => selectCustomer(e.target.value, setEditPackage)} className="min-w-52 rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2"><option value="">Auto-link by name/phone</option>{editPackage.customerId && !customers.some((customer) => customer.id === editPackage.customerId) && <option value={editPackage.customerId}>Linked customer from booking</option>}{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.fullName || customer.name || customer.email}</option>)}</select> : packageRecord.customerId ? <span className="text-lime-300">{linkedCustomer?.fullName || "Linked customer"}</span> : <span className="text-amber-300">Not linked</span>}</td>
                  <td className="p-3">{isEditing ? <input value={editPackage.phone} onChange={(e) => setEditPackage((current) => ({ ...current, phone: e.target.value }))} className="w-full rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2" /> : cleanTableValue(packageRecord.phone) || "-"}</td>
                  <td className="p-3">{usage.attendedClientSessions}</td>
                  <td className="p-3">{isEditing ? <select value={editPackage.packageType} onChange={(e) => applyPackageType(e.target.value, setEditPackage)} className="rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2">{Object.keys(packageOptions).map((packageType) => <option key={packageType} value={packageType}>{packageType}</option>)}</select> : packageRecord.packageLabel || getPackageOption(packageRecord.packageType).label}</td>
                  <td className="p-3">{isEditing ? <input type="number" min="1" step="1" value={editPackage.packageStartSessionNumber} onChange={(e) => setEditPackage((current) => ({ ...current, packageStartSessionNumber: e.target.value }))} title="Used only when no payment date is set" className="w-28 rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2" /> : packageRecord.paymentDate ? packageRecord.paymentDate : `Session ${packageRecord.packageStartSessionNumber || 1}`}</td>
                  <td className="p-3">{isEditing ? <input type="number" min="0" step="0.5" value={editPackage.totalPackageSessions} onChange={(e) => setEditPackage((current) => ({ ...current, totalPackageSessions: e.target.value }))} className="w-24 rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2" /> : `${usage.usedSessions} / ${totalPackageSessions}`}</td>
                  <td className="p-3 text-lime-300">{usage.remainingSessions}</td>
                  <td className="p-3">
                    {isEditing ? (
                      <div className="grid gap-2">
                        <input type="date" value={editPackage.paymentDate} onChange={(e) => setEditPackage((current) => ({ ...current, paymentDate: e.target.value }))} className="rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2" />
                        <input type="number" min="0" step="1" value={editPackage.paymentAmount} onChange={(e) => setEditPackage((current) => ({ ...current, paymentAmount: e.target.value }))} className="rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2" />
                        <select value={editPackage.paymentStatus} onChange={(e) => setEditPackage((current) => ({ ...current, paymentStatus: e.target.value }))} className="rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2"><option>Paid</option><option>Unpaid</option><option>Partial</option></select>
                      </div>
                    ) : `${packageRecord.paymentStatus || "Unpaid"} - RM${paymentAmount}${packageRecord.paymentDate ? ` - ${packageRecord.paymentDate}` : ""}`}
                  </td>
                  <td className="p-3">{isEditing ? <textarea value={editPackage.notes} onChange={(e) => setEditPackage((current) => ({ ...current, notes: e.target.value }))} className="w-full rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2" /> : packageRecord.notes || "-"}</td>
                  <td className="p-3">
                    {canEdit ? (
                      <div className="flex flex-wrap gap-2">
                        {isEditing ? <><button onClick={() => savePackage(packageRecord)} className="rounded-xl bg-lime-400 px-3 py-2 text-black">Save</button><button onClick={() => setEditingPackageId("")} className="rounded-xl bg-neutral-800 px-3 py-2">Cancel</button></> : <><button onClick={() => startEditPackage(packageRecord)} className="rounded-xl bg-neutral-800 px-3 py-2">Edit</button><button onClick={() => markPackagePaid(packageRecord)} className="rounded-xl bg-lime-400 px-3 py-2 text-black">Mark paid</button><button onClick={() => deletePackage(packageRecord)} className="rounded-xl bg-red-500/80 px-3 py-2 text-white">Delete</button></>}
                      </div>
                    ) : <span className="text-neutral-500">Read only</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {packages.length === 0 && <p className="p-4 text-sm text-neutral-400">No active packages yet.</p>}
      </div>
    </div>
  );
}

function StudentHistory({ bookings, packages }) {
  const [studentQuery, setStudentQuery] = useState("");
  const [selectedStudentKey, setSelectedStudentKey] = useState("");

  const students = useMemo(() => {
    const studentsByKey = new Map();

    bookings.forEach((booking) => {
      if (String(booking.type || booking.bookingType || "").toLowerCase() === "blocked") return;
      if (String(booking.name || "").trim().toLowerCase() === "blocked") return;
      if (containsUnavailableText(booking.name) || containsUnavailableText(booking.note)) return;

      const clientName = String(booking.name || "").trim();
      const phone = cleanTableValue(booking.phone);
      if (!clientName && !phone) return;

      const key = phone || normalizeStudentName(clientName);
      const current = studentsByKey.get(key) || {
        key,
        clientName,
        phone,
        totalSessions: 0,
        totalRevenue: 0,
        totalPaid: 0,
      };

      current.clientName = current.clientName || clientName;
      current.phone = current.phone || phone;

      if (isCountedStudentSession(booking)) {
        const revenue = getBookingRevenue(booking);
        current.totalSessions += getBookingDuration(booking);
        current.totalRevenue += revenue;

        if (String(booking.paymentStatus || "").trim().toLowerCase() === "paid") {
          current.totalPaid += revenue;
        }
      }

      studentsByKey.set(key, current);
    });

    return Array.from(studentsByKey.values()).sort((a, b) => {
      return a.clientName.localeCompare(b.clientName);
    });
  }, [bookings]);

  const studentMatches = useMemo(() => {
    const query = studentQuery.trim().toLowerCase();
    if (query.length < 1) return [];

    return students
      .filter((student) => {
        return (
          student.clientName.toLowerCase().includes(query) ||
          student.phone.toLowerCase().includes(query)
        );
      })
      .slice(0, 8);
  }, [studentQuery, students]);

  const selectedStudent = useMemo(() => {
    return students.find((student) => student.key === selectedStudentKey) || null;
  }, [selectedStudentKey, students]);

  const selectedPackage = useMemo(() => {
    if (!selectedStudent) return null;

    return packages.find((packageRecord) => {
      return matchesClientIdentity(
        {
          name: packageRecord.clientName || packageRecord.studentName,
          phone: packageRecord.phone,
        },
        selectedStudent
      );
    }) || null;
  }, [packages, selectedStudent]);

  const selectedPackageUsage = selectedPackage ? getPackageUsage(bookings, selectedPackage) : null;
  const selectedHistory = selectedStudent ? getClientBookingHistory(bookings, selectedStudent) : [];
  const chronologicalHistory = [...selectedHistory].reverse();

  function getSessionPackageLabel(booking) {
    if (!selectedPackage || !isCountedStudentSession(booking)) return "Normal";

    const sessionIndex = chronologicalHistory.findIndex((session) => session.id === booking.id);
    const sessionNumber = sessionIndex + 1;
    const packageStart = Math.max(1, Number(selectedPackage.packageStartSessionNumber || 1));
    const totalPackageSessions = Number(selectedPackage.totalPackageSessions || selectedPackage.totalSessions || 0);

    if (sessionNumber < packageStart) return "Normal";

    const packageSessionNumber = chronologicalHistory
      .slice(packageStart - 1, sessionIndex + 1)
      .filter(isCountedStudentSession)
      .reduce((total, session) => total + getBookingDuration(session), 0);

    return `Package Session ${packageSessionNumber}/${totalPackageSessions}`;
  }

  function selectStudent(student) {
    setSelectedStudentKey(student.key);
    setStudentQuery(`${student.clientName} ${student.phone}`.trim());
  }

  return (
    <div className="mt-8 rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Student History</h2>
          <p className="mt-2 text-neutral-400">
            Search a student to view past sessions, payments, revenue, and package status.
          </p>
        </div>
        <div className="relative w-full md:max-w-md">
          <input
            value={studentQuery}
            onChange={(e) => {
              setStudentQuery(e.target.value);
              setSelectedStudentKey("");
            }}
            placeholder="Search student name or phone"
            className="w-full rounded-2xl border border-neutral-700 bg-neutral-800 px-4 py-3 outline-none focus:border-lime-400"
          />
          {studentQuery.trim().length > 0 && !selectedStudent && studentMatches.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-neutral-700 bg-neutral-950 shadow-2xl">
              {studentMatches.map((student) => (
                <button
                  key={student.key}
                  type="button"
                  onClick={() => selectStudent(student)}
                  className="flex w-full items-center justify-between gap-4 border-b border-neutral-800 px-4 py-3 text-left hover:bg-neutral-800"
                >
                  <span>
                    <span className="block font-semibold">{student.clientName}</span>
                    <span className="block text-xs text-neutral-400">{student.phone || "No phone"}</span>
                  </span>
                  <span className="text-xs text-lime-300">{student.totalSessions} sessions</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedStudent ? (
        <div className="mt-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-neutral-950 p-4">
              <h3 className="text-xl font-semibold text-lime-300">{selectedStudent.clientName}</h3>
              <p className="mt-1 text-sm text-neutral-400">Phone: {selectedStudent.phone || "-"}</p>
              <p className="mt-3 text-sm text-neutral-300">Total Sessions: {selectedStudent.totalSessions}</p>
            </div>
            <div className="rounded-2xl bg-neutral-950 p-4">
              <p className="text-sm text-neutral-400">Total Paid</p>
              <h3 className="mt-1 text-2xl font-semibold">RM{selectedStudent.totalPaid}</h3>
              <p className="mt-3 text-sm text-neutral-400">Total Revenue</p>
              <h3 className="mt-1 text-2xl font-semibold text-lime-300">RM{selectedStudent.totalRevenue}</h3>
            </div>
            <div className="rounded-2xl bg-neutral-950 p-4">
              <p className="text-sm text-neutral-400">Package Status</p>
              {selectedPackage ? (
                <>
                  <h3 className="mt-1 text-xl font-semibold">{selectedPackage.packageLabel || selectedPackage.packageType}</h3>
                  <p className="mt-2 text-sm text-neutral-300">
                    Used: {selectedPackageUsage.usedSessions}/{selectedPackage.totalPackageSessions || selectedPackage.totalSessions}
                  </p>
                  <p className="text-sm text-lime-300">Remaining: {selectedPackageUsage.remainingSessions}</p>
                  <p className="mt-2 text-xs text-neutral-400">Starts at Session {selectedPackage.packageStartSessionNumber || 1}</p>
                </>
              ) : (
                <p className="mt-2 text-sm text-neutral-400">No package assigned.</p>
              )}
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-neutral-800">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-neutral-800 text-neutral-300">
                <tr>
                  <th className="p-3 text-left">Date</th>
                  <th className="p-3 text-left">Time</th>
                  <th className="p-3 text-left">Duration</th>
                  <th className="p-3 text-left">Payment Amount</th>
                  <th className="p-3 text-left">Payment Status</th>
                  <th className="p-3 text-left">Booking Status</th>
                  <th className="p-3 text-left">Package</th>
                  <th className="p-3 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {selectedHistory.map((booking) => {
                  const status = booking.bookingStatus || booking.status || "-";
                  const isCancelled = String(status).toLowerCase() === "cancelled";
                  const paymentAmount = isCountedStudentSession(booking) ? getBookingRevenue(booking) : 0;

                  return (
                    <tr key={booking.id} className="border-t border-neutral-800">
                      <td className="p-3">{booking.date}</td>
                      <td className="p-3">{booking.time}</td>
                      <td className="p-3">{getBookingDuration(booking)} hour(s)</td>
                      <td className="p-3">RM{paymentAmount}</td>
                      <td className="p-3">{booking.paymentStatus || "-"}</td>
                      <td className={`p-3 ${isCancelled ? "text-red-300" : "text-lime-300"}`}>{status}</td>
                      <td className="p-3">{getSessionPackageLabel(booking)}</td>
                      <td className="p-3">{booking.note || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {selectedHistory.length === 0 && (
              <p className="p-4 text-sm text-neutral-400">No session history found.</p>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-5 rounded-2xl bg-neutral-950 p-4 text-sm text-neutral-400">
          Search and select a student to view history.
        </p>
      )}
    </div>
  );
}
function NotificationCenter({ notifications }) {
  const [isOpen, setIsOpen] = useState(false);
  const unreadNotifications = notifications.filter((notification) => !notification.isRead);
  const latestNotifications = notifications.slice(0, 10);

  async function markNotificationRead(notification) {
    await updateDoc(doc(db, "notifications", notification.id), {
      isRead: true,
      readAt: serverTimestamp(),
    });
  }

  async function markAllNotificationsRead() {
    await Promise.all(
      unreadNotifications.map((notification) =>
        updateDoc(doc(db, "notifications", notification.id), {
          isRead: true,
          readAt: serverTimestamp(),
        })
      )
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="relative rounded-2xl bg-neutral-800 px-4 py-3 hover:bg-neutral-700"
        aria-label="Open notifications"
      >
        <Bell size={18} />
        {unreadNotifications.length > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-lime-400 px-1.5 py-0.5 text-xs font-bold text-black">
            {unreadNotifications.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-20 mt-3 w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Notifications</h2>
            <button
              type="button"
              onClick={markAllNotificationsRead}
              disabled={unreadNotifications.length === 0}
              className="rounded-xl bg-neutral-800 px-3 py-2 text-xs disabled:opacity-40"
            >
              Mark all as read
            </button>
          </div>

          <div className="mt-4 max-h-96 space-y-3 overflow-y-auto">
            {latestNotifications.map((notification) => (
              <div
                key={notification.id}
                className={`rounded-2xl border p-4 ${notification.isRead ? "border-neutral-800 bg-neutral-900" : "border-lime-400/50 bg-lime-400/10"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-white">{notification.title || "New Booking"}</h3>
                    <p className="mt-1 text-sm text-neutral-300">{notification.message}</p>
                  </div>
                  {!notification.isRead && (
                    <button
                      type="button"
                      onClick={() => markNotificationRead(notification)}
                      className="shrink-0 rounded-xl bg-lime-400 px-3 py-1.5 text-xs text-black"
                    >
                      Mark as read
                    </button>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-neutral-400">
                  <div>Name: {notification.name || "-"}</div>
                  <div>Phone: {cleanTableValue(notification.phone) || "-"}</div>
                  <div>Date: {notification.date || "-"}</div>
                  <div>Time: {notification.time || "-"}</div>
                  <div>Duration: {notification.duration || "-"} hour(s)</div>
                  <div>{formatNotificationDate(notification.createdAt)}</div>
                </div>
              </div>
            ))}

            {latestNotifications.length === 0 && (
              <p className="rounded-2xl bg-neutral-900 p-4 text-sm text-neutral-400">
                No notifications yet.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TransferSessionModal({ booking, coaches, user, userProfile, onClose }) {
  const [selectedCoachId, setSelectedCoachId] = useState("");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("");

  const activeCoaches = coaches.filter((coach) => coach.active !== false);
  const currentCoachId = booking?.coachId || booking?.createdBy || "";
  const transferTargets = activeCoaches.filter((coach) => coach.coachId !== currentCoachId);

  async function confirmTransfer() {
    const targetCoach = activeCoaches.find((coach) => coach.coachId === selectedCoachId);
    if (!booking?.id || !targetCoach) {
      setStatus("Please choose a coach.");
      return;
    }

    try {
      setStatus("Transferring session...");

      await updateDoc(doc(db, "bookings", booking.id), {
        coachId: targetCoach.coachId,
        coachName: targetCoach.coachName,
        coachEmail: targetCoach.coachEmail || targetCoach.email || "",
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, "transferLogs"), {
        bookingId: booking.id,
        customerName: booking.name || "",
        date: booking.date || "",
        time: booking.time || "",
        duration: getBookingDuration(booking),
        fromCoachId: currentCoachId,
        fromCoachName: booking.coachName || booking.coachEmail || "Unknown coach",
        toCoachId: targetCoach.coachId,
        toCoachName: targetCoach.coachName,
        toCoachEmail: targetCoach.coachEmail || targetCoach.email || "",
        reason: reason.trim(),
        transferredBy: user?.uid || "",
        transferredByName: getCoachName(user, userProfile),
        transferredByRole: getUserRole(userProfile),
        createdAt: serverTimestamp(),
      });

      setStatus("Session transferred.");
      onClose();
    } catch (error) {
      console.error(error);
      setStatus(`Transfer failed: ${error.message || "Please check Firestore rules."}`);
    }
  }

  if (!booking) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-lg rounded-3xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Transfer Session</h2>
            <p className="mt-2 text-sm text-neutral-400">
              {booking.name} · {booking.date} · {booking.time}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl bg-neutral-800 px-3 py-2">Close</button>
        </div>

        <div className="mt-5 space-y-4">
          <div className="rounded-2xl bg-neutral-900 p-4 text-sm text-neutral-300">
            From: <span className="font-semibold text-white">{booking.coachName || booking.coachEmail || "Unknown coach"}</span>
          </div>

          <select
            value={selectedCoachId}
            onChange={(e) => setSelectedCoachId(e.target.value)}
            className="w-full rounded-2xl border border-neutral-700 bg-neutral-800 px-4 py-3 outline-none focus:border-lime-400"
          >
            <option value="">Transfer to...</option>
            {transferTargets.map((coach) => (
              <option key={coach.coachId} value={coach.coachId}>
                {coach.coachName || coach.name || coach.email || coach.coachId}
              </option>
            ))}
          </select>

          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason e.g. Coach unavailable"
            className="w-full rounded-2xl border border-neutral-700 bg-neutral-800 px-4 py-3 outline-none focus:border-lime-400"
          />

          <button
            type="button"
            onClick={confirmTransfer}
            className="w-full rounded-2xl bg-lime-400 px-5 py-3 font-semibold text-black"
          >
            Confirm Transfer
          </button>

          {status && <p className="text-sm text-neutral-300">{status}</p>}
        </div>
      </div>
    </div>
  );
}

function getAreaFromPath(pathname) {
  if (pathname === trainingAreas.jb.slug || pathname === trainingAreas.kl.slug) return "jb";
  return "";
}

function requiresCourtOption(location) {
  return location === trainingAreas.kl.primaryLocation || location === trainingAreas.jb.primaryLocation;
}

function isBeforeKualaLumpurStart(date) {
  const dateString = date instanceof Date ? formatDate(date) : String(date || "").slice(0, 10);
  return Boolean(dateString && dateString < kualaLumpurStartDate);
}

function getStoredTrainingArea() {
  try {
    const value = window.localStorage.getItem("coach-ilham-training-area");
    return value === "jb" ? "jb" : "";
  } catch {
    return "";
  }
}

function saveTrainingArea(area) {
  try {
    window.localStorage.setItem("coach-ilham-training-area", area);
  } catch {
    // Booking still works when storage is unavailable; the area remains in the URL.
  }
}

function isAfterCustomerBookingCutoff(date) {
  const dateString = date instanceof Date ? formatDate(date) : String(date || "").slice(0, 10);
  return Boolean(dateString && dateString > customerBookingCutoffDate);
}

function CancelBookingModal({ booking, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!booking) return null;

  async function confirmCancellation() {
    const cancellationReason = reason.trim();
    if (!cancellationReason) {
      setStatus("Please enter a cancellation reason.");
      return;
    }

    setSubmitting(true);
    setStatus("Cancelling booking...");
    try {
      await onConfirm(booking, cancellationReason);
      onClose();
    } catch (error) {
      console.error(error);
      setStatus(error?.message || "Booking could not be cancelled.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-lg rounded-3xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-red-300">Cancellation required</p>
            <h2 className="mt-2 text-2xl font-semibold">Cancel Booking</h2>
            <p className="mt-2 text-sm text-neutral-400">{booking.name || booking.customerName} · {booking.date} · {booking.time}</p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-xl bg-neutral-800 px-3 py-2 disabled:opacity-50">Close</button>
        </div>

        <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          The booking slot will be released after cancellation. This action requires a reason for the audit record.
        </div>

        <label className="mt-5 block text-sm font-semibold" htmlFor="cancellation-reason">Reason for cancellation</label>
        <textarea
          id="cancellation-reason"
          autoFocus
          rows="4"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            if (status === "Please enter a cancellation reason.") setStatus("");
          }}
          placeholder="Example: Customer requested cancellation, coach unavailable, or court unavailable"
          className="mt-2 w-full rounded-2xl border border-neutral-700 bg-neutral-800 px-4 py-3 outline-none focus:border-red-400"
        />

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-2xl bg-neutral-800 px-5 py-3 font-semibold disabled:opacity-50">Keep Booking</button>
          <button type="button" onClick={confirmCancellation} disabled={submitting || !reason.trim()} className="rounded-2xl bg-red-500 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
            {submitting ? "Cancelling..." : "Confirm Cancellation"}
          </button>
        </div>
        {status && <p className="mt-3 text-sm text-neutral-300">{status}</p>}
      </div>
    </div>
  );
}

function TransferLogs({ logs }) {
  return (
    <div className="mt-8 rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
      <h2 className="text-2xl font-semibold">Transfer Logs</h2>
      <div className="mt-5 space-y-3">
        {logs.slice(0, 10).map((log) => (
          <div key={log.id} className="rounded-2xl bg-neutral-950 p-4 text-sm text-neutral-300">
            <div className="font-semibold text-white">
              {log.date} {log.time} · {log.customerName || "Session"}
            </div>
            <div className="mt-2">
              Transferred by {log.transferredByName || "Super Admin"} from {log.fromCoachName || "-"} to {log.toCoachName || "-"}.
            </div>
            {log.reason && <div className="mt-1 text-neutral-400">Reason: {log.reason}</div>}
          </div>
        ))}
        {logs.length === 0 && (
          <p className="rounded-2xl bg-neutral-950 p-4 text-sm text-neutral-400">No transfer logs yet.</p>
        )}
      </div>
    </div>
  );
}

function PendingCoachApprovals({ users, user }) {
  const pendingUsers = users.filter((adminUser) => {
    return adminUser.role === roles.PENDING_COACH && adminUser.status === "pending";
  });

  async function approveCoach(coachUser) {
    await updateDoc(doc(db, "users", coachUser.uid), {
      role: roles.COACH,
      status: "active",
      active: true,
      coachId: coachUser.uid,
      coachName: coachUser.name || coachUser.coachName || coachUser.email,
      coachEmail: coachUser.email || "",
      approvedAt: serverTimestamp(),
      approvedBy: user?.uid || "",
      updatedAt: serverTimestamp(),
    });

    await setDoc(doc(db, "coaches", coachUser.uid), {
      coachId: coachUser.uid,
      coachName: coachUser.name || coachUser.email,
      phone: coachUser.phone || "",
      role: roles.COACH,
      status: "active",
      active: true,
      color: coachUser.color || "",
      email: coachUser.email || "",
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  async function rejectCoach(coachUser) {
    await updateDoc(doc(db, "users", coachUser.uid), {
      status: "rejected",
      active: false,
      rejectedAt: serverTimestamp(),
      rejectedBy: user?.uid || "",
      updatedAt: serverTimestamp(),
    });
  }

  return (
    <div className="mt-8 rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
      <h2 className="text-2xl font-semibold">Pending Coach Approvals</h2>
      <div className="mt-5 space-y-3">
        {pendingUsers.map((coachUser) => (
          <div key={coachUser.uid} className="flex flex-col gap-3 rounded-2xl bg-neutral-950 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-semibold text-white">{coachUser.name || coachUser.email}</div>
              <div className="text-sm text-neutral-400">{coachUser.email}</div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => approveCoach(coachUser)} className="rounded-xl bg-lime-400 px-4 py-2 text-sm font-semibold text-black">
                Approve Coach
              </button>
              <button type="button" onClick={() => rejectCoach(coachUser)} className="rounded-xl bg-red-500/80 px-4 py-2 text-sm font-semibold text-white">
                Reject
              </button>
            </div>
          </div>
        ))}
        {pendingUsers.length === 0 && (
          <p className="rounded-2xl bg-neutral-950 p-4 text-sm text-neutral-400">No pending coach approvals.</p>
        )}
      </div>
    </div>
  );
}

function PendingLeaveRequests({ requests, bookings, user }) {
  const pendingRequests = requests.filter((request) => request.status === "pending");

  async function approveLeaveRequest(request) {
    const coachBookings = bookings.filter((booking) => {
      return String(booking.coachId || booking.createdBy || "") === String(request.coachId || "");
    });
    const startDate = new Date(request.startDate);
    const endDate = new Date(request.endDate);
    const startIndex = allTimeSlots.indexOf(request.startTime);
    const endIndex = allTimeSlots.indexOf(request.endTime);

    for (
      let current = new Date(startDate);
      current <= endDate;
      current.setDate(current.getDate() + 1)
    ) {
      if (!matchesLeaveDayPattern(current, request.dayPattern || "all")) continue;

      const currentDate = formatDate(current);

      for (let i = startIndex; i <= endIndex; i++) {
        const selectedTime = allTimeSlots[i];
        if (!selectedTime) continue;
        if (hasBookingOverlap(coachBookings, currentDate, selectedTime, 1)) continue;

        await addDoc(collection(db, "bookings"), {
          name: "Blocked",
          phone: "",
          date: currentDate,
          time: selectedTime,
          players: 0,
          duration: 1,
          location: "",
          coachingFee: 0,
          paymentStatus: "",
          bookingStatus: "Confirmed",
          note: request.note || "Coach leave",
          type: "blocked",
          createdBy: request.coachId || "",
          coachId: request.coachId || "",
          coachName: request.coachName || "",
          coachEmail: request.coachEmail || "",
          role: roles.COACH,
          leaveRequestId: request.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    await updateDoc(doc(db, "leaveRequests", request.id), {
      status: "approved",
      approvedAt: serverTimestamp(),
      approvedBy: user?.uid || "",
      updatedAt: serverTimestamp(),
    });
  }

  async function rejectLeaveRequest(request) {
    await updateDoc(doc(db, "leaveRequests", request.id), {
      status: "rejected",
      rejectedAt: serverTimestamp(),
      rejectedBy: user?.uid || "",
      updatedAt: serverTimestamp(),
    });
  }

  return (
    <div className="mt-8 rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
      <h2 className="text-2xl font-semibold">Pending Leave Requests</h2>
      <div className="mt-5 space-y-3">
        {pendingRequests.map((request) => (
          <div key={request.id} className="rounded-2xl bg-neutral-950 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-semibold text-white">{request.coachName || "Coach"}</div>
                <div className="mt-1 text-sm text-neutral-400">
                  {request.startDate} to {request.endDate}, {request.startTime} - {request.endTime}
                </div>
                <div className="mt-1 text-sm text-neutral-500">
                  {leaveDayPatternLabels[request.dayPattern || "all"] || leaveDayPatternLabels.all}
                </div>
                <div className="mt-1 text-sm text-neutral-300">{request.note || "-"}</div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => approveLeaveRequest(request)} className="rounded-xl bg-lime-400 px-4 py-2 text-sm font-semibold text-black">
                  Approve Leave
                </button>
                <button type="button" onClick={() => rejectLeaveRequest(request)} className="rounded-xl bg-red-500/80 px-4 py-2 text-sm font-semibold text-white">
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}
        {pendingRequests.length === 0 && (
          <p className="rounded-2xl bg-neutral-950 p-4 text-sm text-neutral-400">No pending leave requests.</p>
        )}
      </div>
    </div>
  );
}

function StudentDirectoryExport({ bookings, packages, customers }) {
  const [exportStatus, setExportStatus] = useState("");
  const [whatsAppMessage, setWhatsAppMessage] = useState("Hi {name}, ini Coach Ilham. Saya ingin berkongsi maklumat terkini mengenai sesi tenis anda.");
  const students = useMemo(() => {
    const records = new Map();
    const aliases = new Map();

    function getRecordKey(record) {
      const customerId = String(record.customerId || record.uid || "").trim();
      const phone = normalizePhoneNumber(record.customerPhone || record.phone);
      const name = normalizeStudentName(record.customerName || record.clientName || record.studentName || record.fullName || record.name);
      return customerId ? `id:${customerId}` : phone ? `phone:${phone}` : name ? `name:${name}` : "";
    }

    function upsert(record, source) {
      const primaryKey = getRecordKey(record);
      if (!primaryKey) return null;
      const customerId = String(record.customerId || record.uid || "").trim();
      const phone = normalizePhoneNumber(record.customerPhone || record.phone);
      const name = normalizeStudentName(record.customerName || record.clientName || record.studentName || record.fullName || record.name);
      const aliasKeys = [customerId && `id:${customerId}`, phone && `phone:${phone}`, name && `name:${name}`].filter(Boolean);
      const existingKey = aliasKeys.map((key) => aliases.get(key)).find(Boolean) || primaryKey;
      const current = records.get(existingKey) || {
        key: existingKey,
        name: "",
        phone: "",
        email: "",
        coaches: new Set(),
        packages: new Set(),
        bookingIds: new Set(),
        bookingDates: [],
        linkedAccount: false,
      };

      current.name = current.name || String(record.customerName || record.clientName || record.studentName || record.fullName || record.name || "").trim();
      current.phone = current.phone || String(record.customerPhone || record.phone || "").trim();
      current.email = current.email || String(record.customerEmail || record.email || "").trim();
      current.linkedAccount = current.linkedAccount || Boolean(customerId || record.uid);
      if (record.coachName || record.coachEmail) current.coaches.add(record.coachName || record.coachEmail);
      if (source === "package") current.packages.add(record.packageLabel || record.packageType || "Coaching Package");
      if (source === "booking") {
        if (record.id) current.bookingIds.add(record.id);
        if (record.date) current.bookingDates.push(record.date);
      }

      records.set(existingKey, current);
      aliasKeys.forEach((key) => aliases.set(key, existingKey));
      return current;
    }

    bookings.filter((booking) => !booking.isSlotLock && !isUnavailableBooking(booking)).forEach((booking) => upsert(booking, "booking"));
    packages.forEach((packageRecord) => upsert(packageRecord, "package"));

    records.forEach((student) => {
      const linkedCustomer = findMatchingCustomer(customers, {
        customerId: student.key.startsWith("id:") ? student.key.slice(3) : "",
        customerName: student.name,
        phone: student.phone,
      });
      if (!linkedCustomer) return;
      student.name = linkedCustomer.fullName || linkedCustomer.name || student.name;
      student.phone = linkedCustomer.phone || student.phone;
      student.email = linkedCustomer.email || student.email;
      student.linkedAccount = true;
    });

    return Array.from(records.values())
      .map((student) => ({
        name: student.name || "-",
        phone: student.phone || "-",
        email: student.email || "-",
        coaches: Array.from(student.coaches).filter(Boolean).join(", ") || "-",
        totalBookings: student.bookingIds.size,
        lastBookingDate: [...student.bookingDates].sort().at(-1) || "-",
        packages: Array.from(student.packages).filter(Boolean).join(", ") || "-",
        linkedAccount: student.linkedAccount ? "Yes" : "No",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [bookings, customers, packages]);

  const exportRows = useMemo(() => {
    function getPersonalMessage(student) {
      return whatsAppMessage.replaceAll("{name}", student.name === "-" ? "there" : student.name);
    }

    function getWhatsAppFormula(student, message) {
      const phone = normalizePhoneNumber(student.phone);
      if (!phone) return "";
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      const label = `WhatsApp ${student.name === "-" ? "Student" : student.name}`.replaceAll('"', '""');
      return `=HYPERLINK("${url}","${label}")`;
    }

    return [
      ["Student Name", "Phone Number", "WhatsApp Message", "WhatsApp Link", "Email", "Coach", "Total Bookings", "Last Booking Date", "Package", "Linked Customer Account"],
      ...students.map((student) => {
        const message = getPersonalMessage(student);
        const normalizedPhone = normalizePhoneNumber(student.phone);
        return [
          student.name,
          normalizedPhone ? `+${normalizedPhone}` : "-",
          message,
          getWhatsAppFormula(student, message),
          student.email,
          student.coaches,
          student.totalBookings,
          student.lastBookingDate,
          student.packages,
          student.linkedAccount,
        ];
      }),
    ];
  }, [students, whatsAppMessage]);

  function escapeCsvCell(value) {
    const text = String(value ?? "");
    return `"${text.replaceAll('"', '""')}"`;
  }

  function downloadCsv() {
    const csv = exportRows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `student-directory-${formatDate(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setExportStatus(`${students.length} student records exported.`);
  }

  async function copyForGoogleSheets() {
    try {
      const sanitizeSheetCell = (value) => String(value ?? "")
        .replace(/\r?\n+/g, " · ")
        .replaceAll("\t", " ")
        .replace(/\s*·\s*·\s*/g, " · ")
        .trim();
      const tabSeparated = exportRows.map((row) => row.map(sanitizeSheetCell).join("\t")).join("\n");
      await navigator.clipboard.writeText(tabSeparated);
      setExportStatus("Copied in Google Sheets format. Select cell A1 and paste; each student will stay on one row.");
    } catch (error) {
      console.error(error);
      setExportStatus("Could not access the clipboard. Please use Download CSV.");
    }
  }

  return (
    <section className="premium-student-export mt-8">
      <div className="premium-student-export-copy">
        <span className="premium-student-export-icon"><Users size={22} /></span>
        <div>
          <p>Student Directory</p>
          <h2>Export student contact information</h2>
          <span>{students.length} student{students.length === 1 ? "" : "s"} found from the selected coach&apos;s bookings and packages.</span>
        </div>
      </div>
      <div className="premium-student-export-actions">
        <button type="button" onClick={downloadCsv} disabled={students.length === 0}><Download size={17} /> Download CSV</button>
        <button type="button" onClick={copyForGoogleSheets} disabled={students.length === 0}><ClipboardCopy size={17} /> Copy for Google Sheets</button>
        <a href="https://sheets.new" target="_blank" rel="noreferrer"><ExternalLink size={17} /> Open Google Sheets</a>
      </div>
      <label className="premium-student-export-message">
        <span>WhatsApp message included in the export</span>
        <textarea rows="3" value={whatsAppMessage} onChange={(event) => setWhatsAppMessage(event.target.value)} placeholder="Write the WhatsApp message here..." />
        <small>Use <code>{"{name}"}</code> to insert each student&apos;s name automatically.</small>
      </label>
      {exportStatus && <p className="premium-student-export-status">{exportStatus}</p>}
    </section>
  );
}

function AdminDashboard({ bookings, packages, customers, notifications, coaches, transferLogs, users, leaveRequests, onRefresh, user, userProfile, authLoading }) {
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginStatus, setLoginStatus] = useState("");
  const [selectedCoach, setSelectedCoach] = useState("");

  const [blockStartDate, setBlockStartDate] = useState(formatDate(new Date()));
  const [blockEndDate, setBlockEndDate] = useState(formatDate(new Date()));
  const [blockStartTime, setBlockStartTime] = useState("8:00 AM");
  const [blockEndTime, setBlockEndTime] = useState("9:00 AM");
  const [blockDayPattern, setBlockDayPattern] = useState("all");
  const [blockNote, setBlockNote] = useState("NA");
  const [blockStatus, setBlockStatus] = useState("");
  const [leavePrompt, setLeavePrompt] = useState("");
  const [leaveParseStatus, setLeaveParseStatus] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [bookingSearchQuery, setBookingSearchQuery] = useState("");
  const [bookingSort, setBookingSort] = useState({ key: "date", direction: "desc" });
  const [editingPhoneBookingId, setEditingPhoneBookingId] = useState("");
  const [editingPhoneValue, setEditingPhoneValue] = useState("");
  const [phoneEditStatus, setPhoneEditStatus] = useState("");
  const [transferBooking, setTransferBooking] = useState(null);
  const [cancellingBooking, setCancellingBooking] = useState(null);
  const [adminWeekDate, setAdminWeekDate] = useState(formatDate(new Date()));
  const rowsPerPage = 10;
  const userRole = getUserRole(userProfile);
  const canEdit = canEditAdminData(userProfile);
  const isSuperAdmin = userRole === roles.SUPER_ADMIN;
  const visibleBookings = useMemo(() => {
    return bookings.filter((booking) =>
      canViewBookingForAdmin(booking, user, userProfile, selectedCoach)
    );
  }, [bookings, selectedCoach, user, userProfile]);
  const visiblePackages = useMemo(() => {
    return packages.filter((packageRecord) =>
      canViewBookingForAdmin(packageRecord, user, userProfile, selectedCoach)
    );
  }, [packages, selectedCoach, user, userProfile]);
  const coachOptions = useMemo(() => {
    const coachMap = new Map();
    const coachNameKeys = new Map();
    const currentCoachId = getCoachId(user, userProfile);
    const currentCoachName = getCoachName(user, userProfile);

    function normalizeCoachLabel(label) {
      return normalizeStudentName(label)
        .replace(/^coach\s+/, "")
        .trim();
    }

    function setCoachOption(uid, label) {
      if (!uid) return;

      const safeLabel = String(label || uid || "Coach").trim();
      const nameKey = normalizeCoachLabel(safeLabel);
      const existingUid = coachNameKeys.get(nameKey);

      if (existingUid && existingUid !== uid) {
        if (existingUid === currentCoachId) {
          coachMap.set(existingUid, safeLabel);
        }
        return;
      }

      coachNameKeys.set(nameKey, uid);
      coachMap.set(uid, safeLabel);
    }

    if (currentCoachId) {
      setCoachOption(currentCoachId, currentCoachName);
    }

    coaches.forEach((coach) => {
      if (!coach.coachId) return;
      if (coach.active === false) return;
      setCoachOption(coach.coachId, coach.coachName || coach.name || coach.email || coach.coachId);
    });

    bookings.forEach((booking) => {
      const bookingCoachId = booking.coachId || booking.createdBy || currentCoachId;
      if (!bookingCoachId) return;
      if (!coachMap.has(bookingCoachId)) {
        setCoachOption(bookingCoachId, getBookingCoachLabel(booking));
      }
    });

    return Array.from(coachMap.entries()).map(([uid, label]) => ({ uid, label }));
  }, [bookings, coaches, user, userProfile]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isSuperAdmin) return;
    if (coachOptions.length === 0) return;
    if (coachOptions.some((coach) => coach.uid === selectedCoach)) return;

    const ownCoachId = getCoachId(user, userProfile);
    const ownOption = coachOptions.find((coach) => coach.uid === ownCoachId);
    setSelectedCoach(ownOption?.uid || coachOptions[0].uid);
  }, [coachOptions, isSuperAdmin, selectedCoach, user, userProfile]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const adminWeekRange = getPeriodRange("week", adminWeekDate);
  const adminWeekEndDate = new Date(adminWeekRange.end);
  adminWeekEndDate.setDate(adminWeekEndDate.getDate() - 1);
  const adminWeekRangeLabel = `${formatStatsDate(adminWeekRange.start)} - ${formatStatsDate(adminWeekEndDate)}`;
  const adminMonthRange = getPeriodRange("month", adminWeekDate);
  const adminMonthLabel = formatStatsMonth(adminMonthRange.start);

  const bookingStats = {
    week: getBookingStats(visibleBookings, "week", adminWeekDate),
    month: getBookingStats(visibleBookings, "month", adminWeekDate),
    year: getBookingStats(visibleBookings, "year"),
  };
  const currentCustomerCount = getCurrentCustomerCount(visibleBookings);


  const clientBookings = useMemo(() => {
    return visibleBookings.filter((booking) => {
      const name = String(booking.name || "").trim().toLowerCase();
      const payment = String(booking.paymentStatus || booking.payment || "").trim().toLowerCase();
      const note = String(booking.note || "").trim().toLowerCase();
      const type = String(booking.type || booking.bookingType || "").trim().toLowerCase();
      const status = String(booking.status || booking.bookingStatus || "").trim().toLowerCase();

      const isBlocked =
        name === "blocked" ||
        type === "blocked" ||
        status === "blocked" ||
        (Number(booking.players) === 0 && Number(booking.duration) === 0) ||
        ((payment === "n/a" || note === "n/a") && (name === "blocked" || type === "blocked"));

      return !isBlocked;
    });
  }, [visibleBookings]);
  const filteredBookings = useMemo(() => {
    const query = bookingSearchQuery.toLowerCase().trim();

    return clientBookings.filter((booking) => {
      const name = String(booking.name || "").toLowerCase();
      const phone = cleanTableValue(booking.phone).toLowerCase();
      const email = String(booking.customerEmail || "").toLowerCase();
      const reference = String(booking.bookingReference || "").toLowerCase();

      return !query || name.includes(query) || phone.includes(query) || email.includes(query) || reference.includes(query);
    });
  }, [clientBookings, bookingSearchQuery]);
  function getSortValue(booking, key) {
    if (key === "phone") return cleanTableValue(booking.phone).toLowerCase();
    if (["players", "duration"].includes(key)) return Number(booking[key] || 0);
    return String(booking[key] || "").toLowerCase();
  }

  function updateBookingSort(key) {
    setBookingSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
    setCurrentPage(1);
  }

  const sortedBookings = [...filteredBookings].sort((a, b) => {
    const aValue = getSortValue(a, bookingSort.key);
    const bValue = getSortValue(b, bookingSort.key);
    const direction = bookingSort.direction === "asc" ? 1 : -1;

    if (aValue > bValue) return direction;
    if (aValue < bValue) return -direction;
    return 0;
  });
  const totalPages = Math.ceil(sortedBookings.length / rowsPerPage);
  const paginatedBookings = sortedBookings.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );
  const tableColumns = [
    ["bookingReference", "Reference"],
    ["date", "Date"],
    ["time", "Time"],
    ["name", "Name"],
    ["phone", "Phone"],
    ["customerEmail", "Email"],
    ["customerId", "Customer Account"],
    ["players", "Players"],
    ["duration", "Duration"],
    ["location", "Location"],
    ["coachName", "Coach"],
    ["paymentStatus", "Payment"],
    ["bookingStatus", "Status"],
    ["confirmationEmailStatus", "Email"],
    ["pdfGenerated", "PDF"],
    ["note", "Note"],
    ["actions", "Actions"],
  ];

  function renderSortableHeader(key, label) {
    if (key === "actions") {
      return <th key={key} className="p-4 text-left">{label}</th>;
    }

    const isActive = bookingSort.key === key;
    const directionLabel = bookingSort.direction === "asc" ? "A-Z" : "Z-A";

    return (
      <th key={key} className="p-4 text-left">
        <button
          type="button"
          onClick={() => updateBookingSort(key)}
          className="flex items-center gap-2 text-left font-semibold hover:text-lime-300"
        >
          <span>{label}</span>
          <span className="text-[10px] text-neutral-500">
            {isActive ? directionLabel : "Sort"}
          </span>
        </button>
      </th>
    );
  }

  function startPhoneEdit(booking) {
    if (!canEdit) return;

    setEditingPhoneBookingId(booking.id);
    setEditingPhoneValue(cleanTableValue(booking.phone));
    setPhoneEditStatus("");
  }

  function cancelPhoneEdit() {
    setEditingPhoneBookingId("");
    setEditingPhoneValue("");
  }

  async function savePhoneEdit(booking) {
    const nextPhone = editingPhoneValue.trim();

    if (!booking?.id || editingPhoneBookingId !== booking.id) return;

    if (nextPhone === cleanTableValue(booking.phone)) {
      cancelPhoneEdit();
      return;
    }

    try {
      setPhoneEditStatus("Saving phone number...");
      await updateDoc(doc(db, "bookings", booking.id), {
        phone: nextPhone,
        updatedAt: serverTimestamp(),
      });
      setPhoneEditStatus("Phone number updated.");
      cancelPhoneEdit();
    } catch (error) {
      console.error(error);
      setPhoneEditStatus(`Phone update failed: ${error.message || "Please check permissions."}`);
    }
  }

  async function sendConfirmationEmail(booking) {
    try {
      setPhoneEditStatus("Sending confirmation email...");
      const token = await user.getIdToken();
      const response = await fetch("/api/send-booking-confirmation", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ bookingId: booking.id }) });
      if (!response.ok) throw new Error("Email service rejected the request.");
      await updateDoc(doc(db, "bookings", booking.id), { confirmationEmailSent: true, confirmationEmailSentAt: serverTimestamp(), confirmationEmailStatus: "sent", updatedAt: serverTimestamp() });
      setPhoneEditStatus("Confirmation email sent.");
    } catch (error) {
      console.error(error);
      await updateDoc(doc(db, "bookings", booking.id), { confirmationEmailStatus: "failed", updatedAt: serverTimestamp() });
      setPhoneEditStatus("Email failed. You can retry without affecting the confirmed booking.");
    }
  }

  async function manuallyConfirmBooking(booking) {
    try {
      const bookingRef = doc(db, "bookings", booking.id);
      const slots = getRequestedSlotKeys(booking.date, booking.startTime || booking.time, booking.durationHours || booking.duration);
      await runTransaction(db, async (transaction) => {
        const lockRefs = isGroupCoachingBooking(booking) && booking.groupSeatNumber
          ? [doc(db, "availabilityLocks", getGroupSeatLockId(booking.coachId, booking.date, booking.groupSeatNumber))]
          : slots.map((slot) => doc(db, "availabilityLocks", getSlotLockId(booking.coachId, booking.date, slot)));
        const locks = [];
        for (const lockRef of lockRefs) locks.push(await transaction.get(lockRef));
        if (locks.some((lock) => lock.exists() && lock.data().bookingId !== booking.id && lock.data().status !== "expired")) throw new Error("This slot is no longer available.");
        transaction.update(bookingRef, { status: "confirmed", bookingStatus: "Confirmed", bookingReference: booking.bookingReference || getBookingReference(booking.id, booking.date), confirmedAt: serverTimestamp(), pdfGenerated: true, confirmationEmailStatus: "pending", updatedAt: serverTimestamp() });
        lockRefs.forEach((lockRef, index) => {
          const slot = isGroupCoachingBooking(booking) ? "8:00 PM" : slots[index];
          transaction.set(lockRef, { bookingId: booking.id, customerId: booking.customerId || "", customerName: booking.customerName || booking.name || "", coachId: booking.coachId, date: booking.date, time: getAvailabilityLockTime({ date: booking.date, time: slot }), status: "confirmed", confirmationExpiresAt: null, ...(isGroupCoachingBooking(booking) ? { coachingFormat: "group", serviceType: booking.serviceType || "group", groupSeatNumber: booking.groupSeatNumber, groupCapacity: groupCoachingCapacity, ratePerPlayer: groupCoachingFeePerPlayer, duration: 2 } : {}), updatedAt: serverTimestamp() });
        });
      });
      setPhoneEditStatus("Booking confirmed. Use Resend Email to notify the customer.");
    } catch (error) {
      setPhoneEditStatus(error.message || "Could not confirm booking.");
    }
  }

  async function linkLegacyBooking(booking) {
    if (!isSuperAdmin || booking.customerId) return;
    try {
      setPhoneEditStatus("Looking for a verified customer account...");
      const bookingName = normalizeStudentName(booking.customerName || booking.name);
      const bookingPhone = normalizePhoneNumber(booking.customerPhone || booking.phone);
      const customerSnapshot = await getDocs(collection(db, "customers"));
      const phoneMatches = bookingPhone
        ? customerSnapshot.docs.filter((customerDoc) => normalizePhoneNumber(customerDoc.data().phone) === bookingPhone)
        : [];
      const nameMatches = bookingName
        ? customerSnapshot.docs.filter((customerDoc) => normalizeStudentName(customerDoc.data().fullName || customerDoc.data().name) === bookingName)
        : [];
      const matches = phoneMatches.length > 0 ? phoneMatches : nameMatches;

      if (matches.length !== 1) {
        setPhoneEditStatus(matches.length === 0 ? "No exact name or phone match found. The legacy booking was not linked." : "Multiple customer matches found. The legacy booking was not linked.");
        return;
      }
      const customerDoc = matches[0];
      const customer = customerDoc.data();
      const customerPhone = normalizePhoneNumber(customer.phone) || bookingPhone;
      const customerName = normalizeStudentName(customer.fullName || customer.name) || bookingName;
      const matchingBookings = bookings.filter((candidate) => {
        if (candidate.customerId && candidate.customerId !== customerDoc.id) return false;
        if (isUnavailableBooking(candidate)) return false;
        const candidatePhone = normalizePhoneNumber(candidate.customerPhone || candidate.phone);
        const candidateName = normalizeStudentName(candidate.customerName || candidate.name);
        const phoneMatchesCustomer = customerPhone && candidatePhone === customerPhone;
        const nameMatchesCustomer = customerName && candidateName === customerName;
        return phoneMatchesCustomer || nameMatchesCustomer;
      });

      if (!matchingBookings.some((candidate) => candidate.id === booking.id)) matchingBookings.push(booking);
      for (let offset = 0; offset < matchingBookings.length; offset += 400) {
        const batch = writeBatch(db);
        matchingBookings.slice(offset, offset + 400).forEach((candidate) => {
          const normalizedStatus = getNormalizedBookingStatus(candidate);
          batch.update(doc(db, "bookings", candidate.id), {
            customerId: customerDoc.id,
            customerName: customer.fullName || candidate.name || "",
            customerEmail: customer.email || candidate.customerEmail || candidate.email || "",
            customerPhone: customer.phone || candidate.customerPhone || candidate.phone || "",
            ...(normalizedStatus ? { status: normalizedStatus } : {}),
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
      setPhoneEditStatus(`${matchingBookings.length} booking(s) linked to ${customer.fullName || customer.email}.`);
    } catch (error) {
      console.error(error);
      setPhoneEditStatus("Customer linking failed. No booking data was changed.");
    }
  }

  async function cancelBookingAndReleaseLocks(booking, cancellationReason = "Removed from admin schedule") {
    const lockSnapshot = await getDocs(
      query(collection(db, "availabilityLocks"), where("bookingId", "==", booking.id))
    );
    const batch = writeBatch(db);

    batch.update(doc(db, "bookings", booking.id), {
      status: "cancelled",
      bookingStatus: "Cancelled",
      cancelledAt: serverTimestamp(),
      cancelledBy: user?.uid || "",
      cancelledByName: getCoachName(user, userProfile),
      cancelledByEmail: user?.email || "",
      cancelledByRole: userRole,
      cancellationReason: String(cancellationReason || "").trim(),
      updatedAt: serverTimestamp(),
    });
    lockSnapshot.docs.forEach((lockDoc) => batch.delete(lockDoc.ref));
    await batch.commit();
  }

  async function upsertBookingAvailabilityLocks(bookingId, bookingData) {
    const coachId = bookingData.coachId || bookingData.createdBy || "";
    const slots = getRequestedSlotKeys(
      bookingData.date,
      bookingData.startTime || bookingData.time,
      bookingData.durationHours || bookingData.duration || 1
    );

    if (!bookingId || !coachId || !bookingData.date || slots.length === 0) return;

    const existingLocks = await getDocs(query(collection(db, "availabilityLocks"), where("bookingId", "==", bookingId)));
    const batch = writeBatch(db);
    existingLocks.docs.forEach((lockDoc) => batch.delete(lockDoc.ref));

    const status = isUnavailableBooking(bookingData)
      ? "blocked"
      : getNormalizedBookingStatus(bookingData) || "confirmed";

    slots.forEach((slot) => {
      batch.set(doc(db, "availabilityLocks", getSlotLockId(coachId, bookingData.date, slot)), {
        bookingId,
        customerId: bookingData.customerId || "",
        customerName: bookingData.customerName || bookingData.name || "",
        coachId,
        date: bookingData.date,
        time: getAvailabilityLockTime({ date: bookingData.date, time: slot }),
        duration: 1,
        status,
        confirmationExpiresAt: null,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    });

    await batch.commit();
  }

  async function cancelAdminBooking(booking, cancellationReason) {
    if (!isSuperAdmin) throw new Error("Only Super Admin can cancel this booking.");
    if (!String(cancellationReason || "").trim()) throw new Error("A cancellation reason is required.");
    try {
      await cancelBookingAndReleaseLocks(booking, cancellationReason);
      setPhoneEditStatus(`Booking cancelled. Reason: ${String(cancellationReason).trim()}`);
    } catch (error) {
      console.error(error);
      setPhoneEditStatus("Booking could not be cancelled.");
      throw error;
    }
  }

  async function saveWeeklyScheduleCell({ date, time, booking, value }) {
    if (!canEdit) {
      alert("Your account is read-only.");
      return;
    }

    const bookingOwnerId = booking?.coachId || booking?.createdBy || "";

    if (
      userRole !== roles.SUPER_ADMIN &&
      bookingOwnerId &&
      ![user?.uid, userProfile?.coachId].includes(bookingOwnerId)
    ) {
      alert("You can only edit your own bookings.");
      return;
    }

    const text = String(value || "").trim();

    if (booking?.id && !text) {
      await cancelBookingAndReleaseLocks(booking);
      return;
    }

    if (!text) return;
    if (!booking?.id && hasBookingOverlap(visibleBookings, date, time, 1)) {
      alert("That slot is already reserved.");
      return;
    }

    const isBlocked = containsUnavailableText(text);
    const selectedCoachOption = coachOptions.find((coach) => coach.uid === selectedCoach);
    const targetCoachId = isSuperAdmin ? selectedCoach : getCoachId(user, userProfile);
    const targetCoachName = isSuperAdmin
      ? selectedCoachOption?.label || getCoachName(user, userProfile)
      : getCoachName(user, userProfile);

    const scheduleData = {
      name: isBlocked ? "Blocked" : text,
      phone: booking?.phone || "",
      date,
      time,
      players: Number(booking?.players || 1),
      duration: 1,
      location: booking?.location || "Tennis Nusa Duta",
      coachingFee: Number(booking?.coachingFee || 0),
      paymentStatus: booking?.paymentStatus || (isBlocked ? "N/A" : "Unpaid"),
      bookingStatus: "Confirmed",
      note: isBlocked ? text : "",
      type: isBlocked ? "blocked" : "booking",
      paymentType: booking?.paymentType || "pay_per_session",
      packageId: booking?.packageId || "",
      packageType: booking?.packageType || "",
      packageDeductedSessions: booking?.packageDeductedSessions || 0,
      createdBy: booking?.createdBy || user?.uid || "",
      coachId: booking?.coachId || targetCoachId,
      coachName: booking?.coachName || targetCoachName,
      coachEmail: booking?.coachEmail || (!isSuperAdmin ? getCoachEmail(user, userProfile) : ""),
      role: userRole,
      updatedAt: serverTimestamp(),
    };

    if (booking?.id) {
      await updateDoc(doc(db, "bookings", booking.id), scheduleData);
      await upsertBookingAvailabilityLocks(booking.id, { ...booking, ...scheduleData });
      return;
    }

    const scheduleRef = await addDoc(collection(db, "bookings"), {
      ...scheduleData,
      createdAt: serverTimestamp(),
    });
    await upsertBookingAvailabilityLocks(scheduleRef.id, scheduleData);
  }

  async function submitManualBlock() {
    if (!canEdit) {
      setBlockStatus("Your account is read-only.");
      return;
    }

    setBlockStatus("Saving manual block...");

    try {
      const startDate = new Date(blockStartDate);
      const endDate = new Date(blockEndDate);

      const startIndex = allTimeSlots.indexOf(blockStartTime);
      const endIndex = allTimeSlots.indexOf(blockEndTime);
      const selectedCoachOption = coachOptions.find((coach) => coach.uid === selectedCoach);
      const targetCoachId = isSuperAdmin ? selectedCoach : getCoachId(user, userProfile);
      const targetCoachName = isSuperAdmin
        ? selectedCoachOption?.label || getCoachName(user, userProfile)
        : getCoachName(user, userProfile);

      for (
        let current = new Date(startDate);
      current <= endDate;
      current.setDate(current.getDate() + 1)
    ) {
        if (!matchesLeaveDayPattern(current, blockDayPattern)) continue;

        const currentDate = formatDate(current);

        for (let i = startIndex; i <= endIndex; i++) {
          const selectedTime = allTimeSlots[i];

          if (!selectedTime) continue;
          if (hasBookingOverlap(visibleBookings, currentDate, selectedTime, 1)) continue;

          const blockData = {
            name: "Blocked",
            phone: "",
            date: currentDate,
            time: selectedTime,
            players: 0,
            duration: 1,
            location: "",
            coachingFee: 0,
            paymentStatus: "",
            bookingStatus: "Confirmed",
            note: blockNote || "NA",
            type: "blocked",
            createdBy: user?.uid || "",
            coachId: targetCoachId,
            coachName: targetCoachName,
            coachEmail: !isSuperAdmin ? getCoachEmail(user, userProfile) : "",
            role: userRole,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          const blockRef = await addDoc(collection(db, "bookings"), blockData);
          await upsertBookingAvailabilityLocks(blockRef.id, blockData);
        }
      }

      setBlockStatus("Manual block saved.");
      onRefresh();

    } catch (error) {
      console.error(error);
      setBlockStatus("Failed to save manual block.");
    }
  }

  async function applyLeavePrompt() {
    const defaultLeaveRange = getPeriodRange("week", adminWeekDate);
    const parsedLeave = parseLeaveRequest(leavePrompt, {
      defaultStartDate: defaultLeaveRange.start,
      defaultEndDate: defaultLeaveRange.end,
    });

    if (parsedLeave.error) {
      setLeaveParseStatus(parsedLeave.error);
      return;
    }

    if (!isSuperAdmin) {
      await addDoc(collection(db, "leaveRequests"), {
        coachId: getCoachId(user, userProfile),
        coachName: getCoachName(user, userProfile),
        coachEmail: getCoachEmail(user, userProfile),
        startDate: parsedLeave.startDate,
        endDate: parsedLeave.endDate,
        startTime: parsedLeave.startTime,
        endTime: parsedLeave.endTime,
        dayPattern: parsedLeave.dayPattern,
        note: parsedLeave.note,
        rawText: leavePrompt,
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setLeaveParseStatus("Leave request submitted. Waiting for Super Admin approval.");
      setLeavePrompt("");
      return;
    }

    setBlockStartDate(parsedLeave.startDate);
    setBlockEndDate(parsedLeave.endDate);
    setBlockStartTime(parsedLeave.startTime);
    setBlockEndTime(parsedLeave.endTime);
    setBlockDayPattern(parsedLeave.dayPattern || "all");
    setBlockNote(parsedLeave.note);
    setLeaveParseStatus(
      `Ready to block ${parsedLeave.startDate} to ${parsedLeave.endDate}, ${parsedLeave.startTime} - ${parsedLeave.endTime} (${leaveDayPatternLabels[parsedLeave.dayPattern || "all"]}). Review then click Block Selected Range.`
    );
  }

  async function loginAdmin() {
    setLoginStatus("Signing in...");

    try {
      await signInWithEmailAndPassword(
        auth,
        getAdminLoginEmail(loginEmail),
        loginPassword
      );
      setLoginStatus("");
    } catch (error) {
      console.error(error);
      const internalEmail = getAdminLoginEmail(loginEmail);

      if (error.code === "auth/user-not-found" || error.code === "auth/invalid-credential") {
        setLoginStatus(`Login failed. Create Firebase Auth user first: ${internalEmail}`);
      } else if (error.code === "auth/wrong-password") {
        setLoginStatus("Login failed. Wrong password.");
      } else if (
        error.code === "auth/operation-not-allowed" ||
        error.code === "auth/configuration-not-found"
      ) {
        setLoginStatus("Login failed. Enable Firebase Authentication and Email/Password sign-in.");
      } else {
        setLoginStatus(`Login failed: ${error.message}`);
      }
    }
  }

  async function loginWithGoogle() {
    setLoginStatus("Signing in with Google...");

    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setLoginStatus("");
    } catch (error) {
      console.error(error);
      setLoginStatus(`Google sign-in failed: ${error.message}`);
    }
  }

  async function logoutAdmin() {
    await signOut(auth);
  }

  if (authLoading) {
    return (
      <div className="premium-app-page min-h-screen bg-neutral-950 text-white flex items-center justify-center px-5">
        <p className="text-neutral-300">Checking admin access...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="premium-app-page premium-login-page min-h-screen bg-neutral-950 text-white flex items-center justify-center px-5">
        <div className="premium-panel w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-8">
          <h1 className="text-3xl font-bold">Coach Login</h1>
          <p className="mt-2 text-neutral-400">Sign in with your admin username.</p>

          <input
            type="text"
            value={loginEmail}
            onChange={(e) => setLoginEmail(e.target.value)}
            placeholder="Username"
            className="mt-6 w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-lime-400"
          />

          <input
            type="password"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            placeholder="Password"
            className="mt-4 w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-lime-400"
          />

          <button
            onClick={loginAdmin}
            className="mt-4 w-full bg-lime-400 text-black rounded-2xl py-4 font-semibold"
          >
            Login
          </button>

          <button
            type="button"
            onClick={loginWithGoogle}
            className="mt-3 w-full rounded-2xl border border-neutral-700 bg-white px-4 py-4 font-semibold text-black"
          >
            Sign in with Google
          </button>

          {loginStatus && (
            <p className="mt-3 text-sm text-neutral-300">{loginStatus}</p>
          )}
        </div>
      </div>
    );
  }

  if (userProfile?.status === "pending" || userProfile?.role === roles.PENDING_COACH) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center px-5">
        <div className="w-full max-w-lg rounded-3xl border border-neutral-800 bg-neutral-900 p-8 text-center">
          <h1 className="text-3xl font-bold">Pending Approval</h1>
          <p className="mt-3 text-neutral-300">
            Your account is pending approval by Super Admin.
          </p>
          <button onClick={logoutAdmin} className="mt-6 rounded-2xl bg-neutral-800 px-5 py-3 font-semibold">
            Logout
          </button>
        </div>
      </div>
    );
  }

  if (userProfile?.status === "rejected") {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center px-5">
        <div className="w-full max-w-lg rounded-3xl border border-neutral-800 bg-neutral-900 p-8 text-center">
          <h1 className="text-3xl font-bold">Access Rejected</h1>
          <p className="mt-3 text-neutral-300">
            Your coach access request was rejected. Please contact Super Admin.
          </p>
          <button onClick={logoutAdmin} className="mt-6 rounded-2xl bg-neutral-800 px-5 py-3 font-semibold">
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="premium-app-page premium-admin-page min-h-screen bg-neutral-950 text-white px-5 py-10">
      <div className="max-w-6xl mx-auto">

        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="premium-page-title text-4xl font-bold">Admin Dashboard</h1>
            <p className="mt-2 text-neutral-400">
              {getCoachName(user, userProfile)} · {userRole}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <NotificationCenter notifications={notifications} />

            {isSuperAdmin && (
              <select
                value={selectedCoach}
                onChange={(e) => {
                  setSelectedCoach(e.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-2xl bg-neutral-900 border border-neutral-700 px-4 py-3 text-sm"
              >
                {coachOptions.map((coach) => (
                  <option key={coach.uid} value={coach.uid}>
                    {coach.label}
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={onRefresh}
              className="rounded-2xl bg-white text-black px-5 py-3 font-semibold"
            >
              Refresh
            </button>

            <button
              onClick={logoutAdmin}
              className="rounded-2xl bg-neutral-800 px-5 py-3 font-semibold"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="mt-8 grid md:grid-cols-4 gap-4">
          <div className="rounded-3xl bg-neutral-900 border border-neutral-800 p-6">
            <p className="text-sm text-neutral-400">Current Customers</p>
            <h2 className="mt-4 text-4xl font-bold text-lime-300">
              {currentCustomerCount}
            </h2>
          </div>
          {[
            ["This Week", bookingStats.week, adminWeekRangeLabel],
            ["This Month", bookingStats.month, adminMonthLabel],
            ["This Year", bookingStats.year],
          ].map(([label, stats, rangeLabel]) => (
            <div key={label} className="rounded-3xl bg-neutral-900 border border-neutral-800 p-6">
              <p className="text-sm text-neutral-400">{label}</p>
              {rangeLabel && (
                <p className="mt-1 text-sm font-semibold text-neutral-200">
                  {rangeLabel}
                </p>
              )}
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-neutral-500">Valid Bookings</p>
                  <h2 className="mt-1 text-3xl font-bold text-lime-300">
                    {stats.totalBookings}
                  </h2>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-neutral-500">Coaching Hours</p>
                  <h2 className="mt-1 text-3xl font-bold text-lime-300">
                    {stats.totalHours}
                  </h2>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-neutral-500">Estimated Revenue</p>
                  <h2 className="mt-1 text-3xl font-bold text-lime-300">
                    RM{stats.estimatedRevenue}
                  </h2>
                </div>
              </div>
            </div>
          ))}
        </div>

        <StudentDirectoryExport bookings={visibleBookings} packages={visiblePackages} customers={customers} />

        {isSuperAdmin && <PendingCoachApprovals users={users} user={user} />}
        {isSuperAdmin && <PendingLeaveRequests requests={leaveRequests} bookings={bookings} user={user} />}

        {canEdit ? (
          <div className="mt-8 bg-neutral-900 border border-neutral-800 rounded-3xl p-6">
            <div className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <h2 className="text-xl font-semibold">AI Leave Box</h2>
              <p className="mt-1 text-sm text-neutral-400">
                {isSuperAdmin
                  ? "Type leave request in BM or English, then review the manual block fields before saving."
                  : "Type leave request in BM or English. Super Admin must approve before your schedule is blocked."}
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                <textarea
                  value={leavePrompt}
                  onChange={(e) => setLeavePrompt(e.target.value)}
                  placeholder="Example: cuti esok 4pm sampai 7pm sebab family event"
                  className="min-h-24 rounded-2xl border border-neutral-700 bg-neutral-800 px-4 py-3 outline-none focus:border-lime-400"
                />
                <button
                  type="button"
                  onClick={applyLeavePrompt}
                  className="rounded-2xl bg-lime-400 px-5 py-3 font-semibold text-black"
                >
                  {isSuperAdmin ? "Apply" : "Submit Request"}
                </button>
              </div>
              {leaveParseStatus && (
                <p className="mt-3 text-sm text-neutral-300">{leaveParseStatus}</p>
              )}
            </div>

            <h2 className="text-2xl font-semibold">Manual Block Slot</h2>
            <p className="mt-2 text-neutral-400">
              Block slots by date range and time range.
            </p>

            <div className="mt-5 grid md:grid-cols-6 gap-4">
              <input
                type="date"
                value={blockStartDate}
                onChange={(e) => setBlockStartDate(e.target.value)}
                className="rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3"
              />

              <input
                type="date"
                value={blockEndDate}
                onChange={(e) => setBlockEndDate(e.target.value)}
                className="rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3"
              />

              <select
                value={blockStartTime}
                onChange={(e) => setBlockStartTime(e.target.value)}
                className="rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3"
              >
                {allTimeSlots.map((slot) => (
                  <option key={slot}>{slot}</option>
                ))}
              </select>

              <select
                value={blockEndTime}
                onChange={(e) => setBlockEndTime(e.target.value)}
                className="rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3"
              >
                {allTimeSlots.map((slot) => (
                  <option key={slot}>{slot}</option>
                ))}
              </select>

              <select
                value={blockDayPattern}
                onChange={(e) => setBlockDayPattern(e.target.value)}
                className="rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3"
              >
                {Object.entries(leaveDayPatternLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>

              <input
                value={blockNote}
                onChange={(e) => setBlockNote(e.target.value)}
                placeholder="Note e.g. NA / Emergency"
                className="rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3"
              />
            </div>

            <button
              onClick={submitManualBlock}
              className="mt-4 rounded-2xl bg-lime-400 text-black px-5 py-3 font-semibold"
            >
              Block Selected Range
            </button>

            {blockStatus && (
              <p className="mt-3 text-sm text-neutral-300">{blockStatus}</p>
            )}
          </div>
        ) : (
          <div className="mt-8 bg-neutral-900 border border-neutral-800 rounded-3xl p-6">
            <h2 className="text-2xl font-semibold">Read-only Access</h2>
            <p className="mt-2 text-neutral-400">
              Viewer accounts can view schedules and statistics only.
            </p>
          </div>
        )}

        <PackageTracker packages={visiblePackages} bookings={visibleBookings} customers={customers} canEdit={canEdit} user={user} userProfile={userProfile} />
        <StudentHistory bookings={visibleBookings} packages={visiblePackages} />
        {isSuperAdmin && <TransferLogs logs={transferLogs} />}

        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={() => {
              const d = new Date(adminWeekDate);
              d.setDate(d.getDate() - 7);
              setAdminWeekDate(formatDate(d));
            }}
            className="rounded-2xl bg-neutral-800 px-5 py-3"
          >
            &larr; Previous Week
          </button>

          <button
            onClick={() => {
              const d = new Date(adminWeekDate);
              d.setDate(d.getDate() + 7);
              setAdminWeekDate(formatDate(d));
            }}
            className="rounded-2xl bg-neutral-800 px-5 py-3"
          >
            Next Week &rarr;
          </button>
        </div>

        <WeeklySchedule
          bookings={visibleBookings}
          selectedDate={adminWeekDate}
          onSelectDate={setAdminWeekDate}
          editable={canEdit}
          onSaveCell={saveWeeklyScheduleCell}
        />

        <div className="mt-8 bg-neutral-900 border border-neutral-800 rounded-3xl p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Client Bookings</h2>
              <p className="mt-1 text-sm text-neutral-400">
                Showing real client bookings only.
              </p>
            </div>
            <input
              value={bookingSearchQuery}
              onChange={(e) => {
                setBookingSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search reference, name, email or phone"
              className="w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-lime-400 md:max-w-sm"
            />
          </div>
          {phoneEditStatus && (
            <p className="mt-3 text-sm text-neutral-300">{phoneEditStatus}</p>
          )}
        </div>

        <div className="mt-4 overflow-x-auto overflow-y-auto max-h-[600px] rounded-3xl border border-neutral-800">
          <table className="w-full min-w-[1000px] bg-neutral-900 text-sm">
            <thead className="bg-neutral-800 text-neutral-300">
              <tr>
                {tableColumns.map(([key, label]) => renderSortableHeader(key, label))}
              </tr>
            </thead>

            <tbody>
              {paginatedBookings.map((booking, index) => (
                <tr key={index} className="border-t border-neutral-800">
                  <td className="p-4 font-mono text-xs text-lime-300">{booking.bookingReference || "-"}</td>
                  <td className="p-4">{booking.date}</td>
                  <td className="p-4">{booking.time}</td>
                  <td className="p-4 font-semibold text-lime-300">
                    {booking.name}
                  </td>
                  <td className="p-4">
                    {editingPhoneBookingId === booking.id ? (
                      <input
                        autoFocus
                        value={editingPhoneValue}
                        onChange={(e) => setEditingPhoneValue(e.target.value)}
                        onBlur={() => savePhoneEdit(booking)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.currentTarget.blur();
                          }

                          if (e.key === "Escape") {
                            e.preventDefault();
                            cancelPhoneEdit();
                          }
                        }}
                        className="w-36 rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-white outline-none focus:border-lime-400"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => startPhoneEdit(booking)}
                        disabled={!canEdit}
                        className="rounded-lg px-2 py-1 text-left hover:bg-neutral-800 disabled:cursor-default disabled:hover:bg-transparent"
                        title={canEdit ? "Click to edit phone number" : "Read only"}
                      >
                        {cleanTableValue(booking.phone) || "-"}
                      </button>
                    )}
                  </td>
                  <td className="p-4">{booking.customerEmail || "-"}</td>
                  <td className="p-4">{booking.customerId ? <span className="text-lime-300">Linked</span> : <button type="button" onClick={() => linkLegacyBooking(booking)} className="text-amber-300" title="Links all exact name or phone matches to the verified customer">Link All Customer Bookings</button>}</td>
                  <td className="p-4">{booking.players}</td>
                  <td className="p-4">{booking.duration}</td>
                  <td className="p-4">{booking.location}</td>
                  <td className="p-4">{booking.coachName || booking.coachEmail || "-"}</td>
                  <td className="p-4">{booking.paymentStatus}</td>
                  <td className="p-4">{booking.bookingStatus}</td>
                  <td className="p-4 capitalize">{booking.confirmationEmailStatus || "-"}</td>
                  <td className="p-4">{booking.pdfGenerated ? "Ready" : "-"}</td>
                  <td className="p-4">{booking.note}</td>
                  <td className="p-4">
                    {isSuperAdmin ? (
                      <div className="flex min-w-40 flex-col gap-2">
                        <button type="button" onClick={() => setTransferBooking(booking)} className="rounded-xl bg-neutral-800 px-3 py-2 text-xs hover:bg-neutral-700">Transfer Session</button>
                        {booking.status === "pending_confirmation" && <button type="button" onClick={() => manuallyConfirmBooking(booking)} className="rounded-xl bg-lime-400 px-3 py-2 text-xs font-semibold text-black">Confirm Manually</button>}
                        {booking.status === "confirmed" && <button type="button" onClick={() => sendConfirmationEmail(booking)} className="rounded-xl bg-neutral-800 px-3 py-2 text-xs">Resend Email</button>}
                        {booking.status === "confirmed" && <button type="button" onClick={() => downloadBookingPdf(booking)} className="rounded-xl bg-neutral-800 px-3 py-2 text-xs">Regenerate PDF</button>}
                        {!['cancelled', 'expired'].includes(String(booking.status || booking.bookingStatus).toLowerCase()) && <button type="button" onClick={() => setCancellingBooking(booking)} className="rounded-xl bg-red-500/20 px-3 py-2 text-xs text-red-200">Cancel Booking</button>}
                      </div>
                    ) : (
                      <span className="text-neutral-500">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-4 bg-neutral-900 border-t border-neutral-800 px-4 py-4">
          <button
            onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
            disabled={currentPage === 1}
            className="rounded-xl bg-neutral-800 px-4 py-2 disabled:opacity-40"
          >
            Previous
          </button>

          <p className="text-sm text-neutral-400">
            Page {currentPage} of {totalPages || 1}
          </p>

          <button
            onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
            disabled={currentPage === totalPages || totalPages === 0}
            className="rounded-xl bg-neutral-800 px-4 py-2 disabled:opacity-40"
          >
            Next
          </button>
        </div>


        <a href="/" className="inline-block mt-6 text-lime-400">
          &larr; Back to booking page
        </a>

      </div>
      {isSuperAdmin && transferBooking && (
        <TransferSessionModal
          booking={transferBooking}
          coaches={coaches}
          user={user}
          userProfile={userProfile}
          onClose={() => setTransferBooking(null)}
        />
      )}
      {isSuperAdmin && cancellingBooking && (
        <CancelBookingModal
          booking={cancellingBooking}
          onClose={() => setCancellingBooking(null)}
          onConfirm={cancelAdminBooking}
        />
      )}
    </div>
  );
}

function AreaSelectionModal({ onSelect }) {
  return (
    <div className="premium-area-overlay" role="dialog" aria-modal="true" aria-labelledby="area-picker-title">
      <div className="premium-area-modal">
        <p>Coach Ilham Academy</p>
        <h2 id="area-picker-title">Where would you like to train?</h2>
        <span>Select your area to see the correct coaches, venues and available sessions.</span>
        <div className="premium-area-options">
          <button type="button" onClick={() => onSelect("jb")}>
            <small>Available now</small>
            <strong>Johor Bahru</strong>
            <span>Book with the Coach Ilham Academy coaching team in Johor Bahru.</span>
            <b>Choose Johor Bahru &rarr;</b>
          </button>
        </div>
      </div>
    </div>
  );
}

function HomePage({ area = "" }) {
  const [showAreaPicker, setShowAreaPicker] = useState(false);
  const [activeCoachProfile, setActiveCoachProfile] = useState(area === "jb" ? 1 : 0);
  const activeArea = trainingAreas[area] || null;
  const isKualaLumpur = area === "kl";
  const whatsappUrl = `https://wa.me/601137507963?text=${encodeURIComponent("Hi Coach Ilham, I would like to enquire about tennis coaching and book a session.")}`;
  const bookingUrl = `/booking${area ? `?area=${area}` : ""}`;
  const areaName = activeArea?.name || "Kuala Lumpur or Johor Bahru";
  const heroTitle = isKualaLumpur ? "Private Tennis Coach in Kuala Lumpur" : area === "jb" ? "Tennis Coaching in Johor Bahru" : "Professional Tennis Coaching in Malaysia";
  const heroDescription = isKualaLumpur
    ? "Book private tennis lessons in Kuala Lumpur with Coach Ilham for kids and adults, from complete beginners to experienced players who want focused, personalised training."
    : area === "jb"
      ? "Book tennis lessons in Johor Bahru with the Coach Ilham Academy coaching team for kids, adults, private sessions and structured group coaching."
      : "Choose Kuala Lumpur or Johor Bahru to view local coaches, venues and real-time tennis coaching availability.";
  const coachProfiles = [
    {
      name: "Coach Ilham",
      area: "Kuala Lumpur",
      areaId: "kl",
      image: coachImage,
      badge: "Kuala Lumpur · Available from 1 October 2026",
      imageAlt: "Coach Ilham, tennis coach in Kuala Lumpur",
      intro: "An ITF Coaching Level 1 and Sport Science Level 1 coach providing personalised private tennis coaching for kids and adults.",
      stats: [
        { value: "ITF L1", label: "Coaching qualification" },
        { value: "SS L1", label: "Sport Science" },
        { value: "KL", label: "Coaching location" },
      ],
      historyLabel: "Coaching focus",
      history: ["Private coaching", "Kids and adults", "Beginner development", "Goal-based training"],
    },
    {
      name: "Coach Aminur Ilham",
      area: "Johor Bahru",
      areaId: "jb",
      image: aminurIlhamImage,
      badge: "Johor Bahru · Decathlon Malaysia Tennis Ambassador",
      imageAlt: "Coach Aminur Ilham, tennis coach and Decathlon Malaysia Tennis Ambassador in Johor Bahru",
      intro: "A 26-year-old Tennis Coaching Level 1 coach with 16 years of tennis experience and 5 years of coaching experience.",
      stats: [
        { value: "16", label: "Years playing tennis" },
        { value: "5", label: "Years coaching" },
        { value: "Level 1", label: "Tennis coaching" },
      ],
      historyLabel: "Coaching experience",
      history: ["Academy Tennis Pontian", "Johor Tennis Association", "Tennis Town", "Raffles American School"],
    },
    {
      name: "Coach Asyraf",
      area: "Johor Bahru",
      areaId: "jb",
      image: coachAsyrafImage,
      badge: "Johor Bahru · ITF Level 1 Coach",
      imageAlt: "Coach Asyraf, ITF Level 1 tennis coach in Johor Bahru",
      intro: "A certified coach with 14 years of tennis experience, supported by qualifications in tennis coaching, sport science and professional pickleball.",
      stats: [
        { value: "14", label: "Years of tennis experience" },
        { value: "ITF L1", label: "Tennis coaching" },
        { value: "PPR", label: "Certified" },
      ],
      historyLabel: "Professional qualifications",
      history: ["ITF Level 1 Certificate", "Sport Science Level 1", "Professional Pickleball Registry (PPR) Certificate"],
    },
    {
      name: "Coach Zayn Syafiq",
      area: "Johor Bahru",
      areaId: "jb",
      image: coachZaynSyafiqImage,
      badge: "Johor Bahru · ITF Level 1 Coach",
      imageAlt: "Coach Zayn Syafiq, ITF Level 1 tennis coach in Johor Bahru",
      intro: "A certified coach with 12 years of tennis experience and qualifications in both tennis coaching and sport science.",
      stats: [
        { value: "12", label: "Years of tennis experience" },
        { value: "ITF L1", label: "Tennis coaching" },
        { value: "SS L1", label: "Sport Science" },
      ],
      historyLabel: "Professional qualifications",
      history: ["ITF Level 1 Certificate", "Sport Science Level 1"],
    },
  ];
  const displayedCoach = coachProfiles[activeCoachProfile];

  function changeCoachProfile(direction) {
    setActiveCoachProfile((current) => (current + direction + coachProfiles.length) % coachProfiles.length);
  }

  useEffect(() => {
    const title = isKualaLumpur
      ? "Tennis Coach Kuala Lumpur | Private Tennis Lessons | Coach Ilham"
      : area === "jb"
        ? "Tennis Coach Johor Bahru | Tennis Lessons | Coach Ilham Academy"
        : "Coach Ilham Academy | Tennis Coaching Kuala Lumpur & Johor Bahru";
    const description = isKualaLumpur
      ? "Book a certified tennis coach in Kuala Lumpur. Private tennis lessons for kids and adults at Jalan Duta or your preferred KL court from 1 October 2026."
      : area === "jb"
        ? "Book tennis coaching in Johor Bahru for kids and adults with real-time coach availability at Nusa Duta and selected JB courts."
        : "Private and group tennis coaching in Kuala Lumpur and Johor Bahru for kids and adults. Choose your area and book online.";
    const canonicalPath = activeArea?.slug || "/";
    document.title = title;
    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement("meta");
      metaDescription.setAttribute("name", "description");
      document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute("content", description);
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", `https://ilhamacademy.pages.dev${canonicalPath}`);
    let structuredData = document.getElementById("coach-ilham-location-schema");
    if (!structuredData) {
      structuredData = document.createElement("script");
      structuredData.id = "coach-ilham-location-schema";
      structuredData.setAttribute("type", "application/ld+json");
      document.head.appendChild(structuredData);
    }
    structuredData.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "SportsActivityLocation",
      name: isKualaLumpur ? "Coach Ilham Academy Kuala Lumpur" : area === "jb" ? "Coach Ilham Academy Johor Bahru" : "Coach Ilham Academy",
      url: `https://ilhamacademy.pages.dev${canonicalPath}`,
      telephone: "+601137507963",
      sport: "Tennis",
      areaServed: areaName,
      address: activeArea ? { "@type": "PostalAddress", streetAddress: isKualaLumpur ? "Jalan Duta National Tennis Centre" : "Nusa Duta Tennis Complex", addressLocality: activeArea.name, addressCountry: "MY" } : undefined,
    });
  }, [activeArea, area, areaName, isKualaLumpur]);

  function selectArea(nextArea) {
    saveTrainingArea(nextArea);
    window.location.assign(trainingAreas[nextArea].slug);
  }

  return (
    <div className="premium-home min-h-screen w-full max-w-full overflow-x-hidden bg-neutral-950 text-white">
      {showAreaPicker && <AreaSelectionModal onSelect={selectArea} />}
      <div className="premium-home-shell w-full max-w-6xl mx-auto px-4 py-8 sm:px-5 sm:py-12">
        <div className="premium-topbar flex justify-between mb-6">
          <nav className="premium-topbar-nav" aria-label="Homepage navigation">
            <button type="button" onClick={() => setShowAreaPicker(true)} className="premium-area-change">
              {activeArea ? `${activeArea.name} · Change area` : "Choose training area"}
            </button>
            <a
              href="#our-coaches"
              className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:border-lime-400 hover:text-lime-300 transition"
            >
              Meet Our Coaches
            </a>
            <a
              href="/admin"
              className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:border-lime-400 hover:text-lime-300 transition"
            >
              Coach Login
            </a>
          </nav>
        </div>

        <div className="premium-hero grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10 items-center overflow-hidden">
          <div className="premium-hero-copy">
            <p className="premium-kicker inline-block rounded-full border border-lime-400/40 px-4 py-2 text-sm text-lime-300">
              ITF Coaching Level 1 - Sport Science Level 1
            </p>

            <h1 className="premium-display mt-6 text-4xl md:text-6xl font-bold">
              {heroTitle}
            </h1>

            <p className="premium-lead mt-5 text-neutral-300 text-lg">
              {heroDescription}
            </p>

            <p className="premium-location mt-3 text-neutral-400">
              {isKualaLumpur ? "Available from 1 October 2026 at Jalan Duta National Tennis Centre or your preferred Kuala Lumpur court." : area === "jb" ? "Coaching sessions in Johor Bahru with the Coach Ilham Academy team." : "Choose your city to view local availability."}
            </p>

            <div className="premium-hero-actions">
              <a href={bookingUrl} className="premium-primary-cta">Book in {areaName} <span aria-hidden="true">&rarr;</span></a>
              <a href={whatsappUrl} target="_blank" rel="noreferrer" className="premium-whatsapp-cta"><MessageCircle size={18} /> Chat on WhatsApp</a>
            </div>
          </div>

          <div className="premium-portrait-wrap flex justify-center">
            <img
              src={area === "jb" ? aminurIlhamImage : coachImage}
              alt={area === "jb" ? "Coach Aminur Ilham in Johor Bahru" : "Coach Ilham in Kuala Lumpur"}
              className="premium-portrait w-full max-w-sm sm:max-w-md rounded-3xl border border-neutral-800 object-cover shadow-2xl"
            />
          </div>
        </div>

        <section className="premium-friendly-guide">
          <article className="premium-coach-preview">
            <div className="premium-guide-label">Choose your coach</div>
            <div className="premium-coach-preview-card">
              <img src={area === "jb" ? aminurIlhamImage : coachImage} alt="" />
              <div>
                <strong>{area === "jb" ? "Coach Aminur Ilham" : "Coach Ilham"}</strong>
                <span>{area === "jb" ? "Tennis Coaching Level 1" : "ITF Level 1 - Sport Science Level 1"}</span>
                <small>{area === "jb" ? "Johor Bahru · 5 years coaching experience" : "Kuala Lumpur · Private coaching for kids and adults"}</small>
              </div>
              <span aria-hidden="true"></span>
            </div>
          </article>
          <article className="premium-how-it-works">
            <div className="premium-guide-label">How to book your coaching session</div>
            <div className="premium-step-list">
              <div><span>1</span><strong>Select your coach</strong><small>Choose the coach you would like to train with.</small></div>
              <div><span>2</span><strong>Pick a coaching time</strong><small>Select an available slot or add several sessions to a bundle.</small></div>
              <div><span>3</span><strong>Check court availability</strong><small>Open the court website and secure a court that matches your coaching slot.</small></div>
              <div><span>4</span><strong>Confirm &amp; book</strong><small>Once the court is confirmed, review and submit your coaching booking.</small></div>
            </div>
          </article>
        </section>

        <section id="our-coaches" className="premium-coach-slider" aria-labelledby="coach-profile-heading">
          <div className="premium-coach-slider-heading">
            <div>
              <p>Our coaching team</p>
              <h2 id="coach-profile-heading">Meet your coach</h2>
            </div>
            <div className="premium-coach-slider-controls">
              <button type="button" onClick={() => changeCoachProfile(-1)} aria-label="Show previous coach">&larr;</button>
              <span>{activeCoachProfile + 1} / {coachProfiles.length}</span>
              <button type="button" onClick={() => changeCoachProfile(1)} aria-label="Show next coach">&rarr;</button>
            </div>
          </div>

          <article key={displayedCoach.name} className="premium-coach-profile" aria-live="polite">
            <div className="premium-coach-profile-media">
              <img
                src={displayedCoach.image}
                alt={displayedCoach.imageAlt}
              />
              <span>{displayedCoach.badge}</span>
            </div>
            <div className="premium-coach-profile-copy">
              <p>{displayedCoach.area}</p>
              <h3>{displayedCoach.name}</h3>
              <p className="premium-coach-profile-intro">{displayedCoach.intro}</p>
              {displayedCoach.stats.length > 0 && (
                <div className="premium-coach-profile-stats" aria-label={`${displayedCoach.name} experience`}>
                  {displayedCoach.stats.map((stat) => (
                    <div key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>
                  ))}
                </div>
              )}
              {displayedCoach.history.length > 0 && (
                <div className="premium-coach-profile-history">
                  <span>{displayedCoach.historyLabel}</span>
                  <ul>
                    {displayedCoach.history.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              )}
              <a href={`/booking?area=${displayedCoach.areaId}`}>Book with {displayedCoach.name} in {displayedCoach.area} <span aria-hidden="true">&rarr;</span></a>
            </div>
          </article>

          <div className="premium-coach-slider-tabs" role="tablist" aria-label="Choose a coach profile">
            {coachProfiles.map((coach, index) => (
              <button
                key={coach.name}
                type="button"
                role="tab"
                aria-selected={activeCoachProfile === index}
                onClick={() => setActiveCoachProfile(index)}
                className={activeCoachProfile === index ? "is-active" : ""}
              >
                <img src={coach.image} alt="" />
                <span><strong>{coach.name}</strong><small>{coach.area}</small></span>
              </button>
            ))}
          </div>
        </section>

        <section className="premium-services mt-10 grid gap-4 md:grid-cols-2">
          {serviceOptions.map((service, index) => (
            <a
              key={service.id}
              href={`/booking?service=${service.id}${area ? `&area=${area}` : ""}`}
              className="premium-service-card rounded-3xl border border-neutral-800 bg-neutral-900 p-5 transition hover:border-lime-400/70 hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-lime-400"
            >
              <span className="premium-service-index">0{index + 1}</span>
              <h2 className="text-xl font-semibold">{service.title}</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-400">{service.description}</p>
            </a>
          ))}
        </section>

        {isKualaLumpur && (
          <section className="premium-location-seo" aria-labelledby="kl-tennis-coach-heading">
            <p>Tennis coaching in Kuala Lumpur</p>
            <h2 id="kl-tennis-coach-heading">Private Tennis Lessons in Kuala Lumpur with Coach Ilham</h2>
            <div>
              <p>Looking for a tennis coach in Kuala Lumpur? Coach Ilham provides personalised lessons for kids, adults and beginners, with training shaped around your level, goals and pace.</p>
              <p>Sessions begin from 1 October 2026 at Jalan Duta National Tennis Centre or at a suitable Kuala Lumpur court preferred by the client.</p>
            </div>
            <a href={bookingUrl}>View Kuala Lumpur availability <span aria-hidden="true">&rarr;</span></a>
          </section>
        )}

        <section className="premium-trust-strip">
          <div><strong>All ages & levels</strong><span>Kids, adults and beginners</span></div>
          <div><strong>Personalised sessions</strong><span>Training tailored to your goals</span></div>
          <div><strong>Real-time availability</strong><span>See open coaching slots instantly</span></div>
          <div><strong>Flexible bundles</strong><span>Reserve multiple future sessions</span></div>
        </section>
      </div>
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noreferrer"
        aria-label="Contact Coach Ilham on WhatsApp"
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 font-semibold text-white shadow-2xl transition hover:scale-105 hover:bg-[#20bd5a] focus:outline-none focus:ring-2 focus:ring-white sm:bottom-7 sm:right-7"
      >
        <MessageCircle size={24} fill="currentColor" strokeWidth={1.8} />
        <span>Contact Us</span>
      </a>
    </div>
  );
}

function CustomerHeader({ user, profile }) {
  return (
    <header className="premium-customer-header mb-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
      <a href="/" className="font-bold text-lime-300">Coach Ilham Academy</a>
      <nav className="flex flex-wrap items-center gap-3 text-sm">
        <a href="/booking" className="hover:text-lime-300">Book a Session</a>
        <a href="/my-bookings" className="hover:text-lime-300">My Bookings</a>
        <a href="/my-profile" className="hover:text-lime-300">My Profile</a>
        {user?.photoURL && <img src={user.photoURL} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />}
        <span className="hidden sm:inline text-neutral-300">{profile?.fullName || user?.displayName}</span>
        <button type="button" onClick={() => signOut(auth)} className="rounded-xl border border-neutral-700 px-3 py-2">Sign Out</button>
      </nav>
    </header>
  );
}

function CustomerAccess({ user, profile, loading, children }) {
  const isGoogleAccount = user?.providerData?.some((provider) => provider.providerId === "google.com") && !String(user?.email || "").endsWith("@ilham-booking.local");
  const [fullName, setFullName] = useState(user?.displayName || "");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function login() {
    setMessage("");
    try {
      if (user && !isGoogleAccount) await signOut(auth);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error(error);
      setMessage("Google sign-in was not completed. Please try again.");
    }
  }

  async function saveProfile() {
    if (!user || !fullName.trim() || !phone.trim()) {
      setMessage("Full name and phone number are required.");
      return;
    }
    setSaving(true);
    try {
      await setDoc(doc(db, "customers", user.uid), {
        uid: user.uid,
        fullName: fullName.trim(),
        email: user.email || "",
        phone: phone.trim(),
        photoURL: user.photoURL || "",
        provider: "google",
        role: "customer",
        profileCompleted: true,
        createdAt: profile?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      console.error(error);
      const errorCode = error?.code ? ` (${error.code})` : "";
      setMessage(`Profile could not be saved${errorCode}. Check that the latest Firestore rules are deployed.`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="premium-app-page min-h-screen bg-neutral-950 p-10 text-center text-white">Checking your account...</div>;
  if (!user || !isGoogleAccount) return (
    <div className="premium-app-page premium-login-page min-h-screen bg-neutral-950 px-4 py-16 text-white">
      <div className="premium-panel mx-auto max-w-lg rounded-3xl border border-neutral-800 bg-neutral-900 p-8 text-center">
        <h1 className="text-3xl font-bold">Sign in to book</h1>
        <p className="mt-3 text-neutral-400">Google sign-in is required before you can select or reserve a coaching slot.</p>
        {user && !isGoogleAccount && <p className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">A coach/admin session is currently active. Continue with Google to switch to a customer account.</p>}
        <button type="button" onClick={login} className="mt-7 w-full rounded-2xl bg-white py-4 font-semibold text-black">Continue with Google</button>
        {message && <p className="mt-4 text-sm text-red-300">{message}</p>}
      </div>
    </div>
  );
  if (!profile?.profileCompleted) return (
    <div className="premium-app-page premium-login-page min-h-screen bg-neutral-950 px-4 py-12 text-white">
      <div className="premium-panel mx-auto max-w-lg rounded-3xl border border-neutral-800 bg-neutral-900 p-8">
        <h1 className="text-3xl font-bold">Complete your profile</h1>
        <p className="mt-2 text-neutral-400">You only need to do this once.</p>
        <label className="mt-6 block text-sm">Full Name</label>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-2 w-full rounded-2xl border border-neutral-700 bg-neutral-800 px-4 py-3" />
        <label className="mt-4 block text-sm">Google Email</label>
        <div className="mt-2 rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-neutral-400">{user.email}</div>
        <label className="mt-4 block text-sm">Phone Number</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className="mt-2 w-full rounded-2xl border border-neutral-700 bg-neutral-800 px-4 py-3" />
        <button type="button" disabled={saving} onClick={saveProfile} className="mt-6 w-full rounded-2xl bg-lime-400 py-4 font-semibold text-black disabled:opacity-50">{saving ? "Saving..." : "Save Profile"}</button>
        {message && <p className="mt-4 text-sm text-red-300">{message}</p>}
      </div>
    </div>
  );
  return children;
}

function BookingDetails({ booking }) {
  const rows = isGroupCoachingBooking(booking) ? [
    ["Player", booking.customerName || booking.name],
    ["Session", "Group Coaching"],
    ["Date", booking.date],
    ["Time", "8:00 PM - 10:00 PM"],
    ["Rate", `RM${booking.ratePerPlayer || groupCoachingFeePerPlayer} per player`],
    ["Group Capacity", `${booking.groupCapacity || groupCoachingCapacity} players maximum`],
    ["Booking Status", String(booking.status || booking.bookingStatus || "").replaceAll("_", " ")],
  ] : [
    ["Customer", booking.customerName || booking.name],
    ["Coach", booking.coachName],
    ["Date", booking.date],
    ["Time", `${booking.startTime || booking.time} - ${booking.endTime || getEndTime(booking.time, booking.duration)}`],
    ["Duration", `${booking.durationHours || booking.duration} Hour(s)`],
    ["Players", `${booking.players} Player(s)`],
    ["Location", booking.location],
    ["Court", booking.court || booking.courtOption || "-"],
    ["Estimated Coaching Fee", `RM${booking.coachingFee ?? 0}`],
    ["Booking Status", String(booking.status || booking.bookingStatus || "").replaceAll("_", " ")],
  ];
  if (booking.cancellationReason) rows.push(["Cancellation Reason", booking.cancellationReason]);
  return <dl className="divide-y divide-neutral-800">{rows.map(([label, value]) => <div key={label} className="grid gap-1 py-3 sm:grid-cols-2"><dt className="text-neutral-400">{label}</dt><dd className="font-medium capitalize">{value || "-"}</dd></div>)}</dl>;
}

function SelectedCoachWhatsAppLink({ booking, bookings = [] }) {
  const group = bookings.length > 1 ? bookings : [booking];
  const coachPhone = getCoachWhatsAppNumber(booking);
  const coachUrl = group.length > 1 ? getBundleWhatsAppUrl(coachPhone, group) : getWhatsAppBookingUrl(coachPhone, booking);

  if (!coachUrl) return <p className="mt-4 text-sm text-amber-300">The selected coach does not have a WhatsApp number saved yet.</p>;

  return <div className="mt-5">
    <p className="mb-3 text-sm text-neutral-400">Open WhatsApp with the booking details ready, then press Send.</p>
    <a href={coachUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-black"><MessageCircle size={18} /> WhatsApp {booking.coachName || "Selected Coach"}</a>
  </div>;
}

function ConfirmationPage({ booking, bundleBookings = [], user, profile, onConfirm, onConfirmBundle, loading, status }) {
  if (!booking || booking.customerId !== user?.uid) return <CustomerShell user={user} profile={profile}><p>Booking not found or you do not have access.</p></CustomerShell>;
  const group = bundleBookings.length > 1 ? [...bundleBookings].sort((a, b) => Number(a.bundleIndex || 0) - Number(b.bundleIndex || 0)) : [booking];
  const isBundle = group.length > 1;
  const expiryDates = group.map((item) => item.confirmationExpiresAt?.toDate?.()).filter(Boolean);
  const expiry = expiryDates.length ? new Date(Math.min(...expiryDates.map((item) => item.getTime()))) : null;
  function handleConfirmClick() {
    const whatsappWindow = getCoachWhatsAppNumber(booking) ? window.open("about:blank", "_blank") : null;
    if (whatsappWindow) whatsappWindow.opener = null;
    if (isBundle) onConfirmBundle(group, whatsappWindow);
    else onConfirm(booking, whatsappWindow);
  }
  return <CustomerShell user={user} profile={profile} title={isBundle ? "Review your session bundle" : "Review your booking"}>
    {isBundle && <div className="mb-6 rounded-2xl border border-lime-400/30 bg-lime-400/5 p-5"><p className="text-sm text-lime-300">Bundle Reference</p><p className="mt-1 text-2xl font-bold text-lime-300">{booking.bundleReference}</p><p className="mt-2 text-sm text-neutral-300">{group.length} sessions with {booking.coachName}</p></div>}
    <div className={isBundle ? "space-y-4" : ""}>{group.map((item, index) => <article key={item.id} className={isBundle ? "rounded-2xl border border-neutral-800 bg-neutral-950 p-5" : ""}>{isBundle && <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-lime-300">Session {index + 1}</p>}<BookingDetails booking={item} /></article>)}</div>
    {expiry && <p className="mt-4 text-sm text-amber-300">This slot is reserved until {expiry.toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" })}.</p>}
    <div className="mt-7 grid gap-3 sm:grid-cols-2">
      <button type="button" onClick={handleConfirmClick} disabled={loading} className="rounded-2xl bg-lime-400 py-4 font-semibold text-black disabled:opacity-50">{loading ? "Confirming..." : isBundle ? `Confirm ${group.length} Sessions` : "Confirm Booking"}</button>
      {!isBundle && <a href={`/booking?edit=${booking.id}`} className="rounded-2xl border border-neutral-700 py-4 text-center font-semibold">Edit Booking</a>}
      {isBundle && <a href="/my-bookings" className="rounded-2xl border border-neutral-700 py-4 text-center font-semibold">Confirm Later</a>}
    </div>
    <SelectedCoachWhatsAppLink booking={booking} bookings={group} />
    {status && <p className="mt-4 text-sm text-neutral-300">{status}</p>}
  </CustomerShell>;
}

function CustomerShell({ user, profile, title, children }) {
  return <div className="premium-app-page premium-customer-page min-h-screen bg-neutral-950 px-4 py-6 text-white"><div className="mx-auto max-w-4xl"><CustomerHeader user={user} profile={profile} /><main className="premium-panel rounded-3xl border border-neutral-800 bg-neutral-900 p-6 sm:p-8">{title && <h1 className="premium-page-title mb-6 text-3xl font-bold">{title}</h1>}{children}</main></div></div>;
}

function SuccessPage({ booking, bundleBookings = [], user, profile }) {
  const group = bundleBookings.length > 1 ? [...bundleBookings].sort((a, b) => Number(a.bundleIndex || 0) - Number(b.bundleIndex || 0)) : [booking];
  const isBundle = group.length > 1;
  if (!booking || booking.customerId !== user?.uid || group.some((item) => String(item.status).toLowerCase() !== "confirmed")) return <CustomerShell user={user} profile={profile}><p>Confirmed booking not found.</p></CustomerShell>;
  return <CustomerShell user={user} profile={profile} title={isBundle ? "Bundle Confirmed" : "Booking Confirmed"}>
    <p className="text-lg text-neutral-300">Your {isBundle ? `${group.length}-session bundle has` : "booking has"} been successfully confirmed.</p>
    <div className="my-6 rounded-2xl bg-lime-400/10 p-5"><p className="text-sm text-lime-300">{isBundle ? "Bundle Reference" : "Booking Reference"}</p><p className="mt-1 text-2xl font-bold text-lime-300">{isBundle ? booking.bundleReference : booking.bookingReference}</p></div>
    <div className={isBundle ? "space-y-4" : ""}>{group.map((item, index) => <article key={item.id} className={isBundle ? "rounded-2xl border border-neutral-800 bg-neutral-950 p-5" : ""}>{isBundle && <div className="mb-2 flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-widest text-lime-300">Session {index + 1}</p><button type="button" onClick={() => downloadBookingPdf(item)} className="rounded-xl border border-neutral-700 px-3 py-2 text-xs">Download PDF</button></div>}<BookingDetails booking={item} /></article>)}</div>
    <div className="mt-7 grid gap-3 sm:grid-cols-3">
      {!isBundle && <button type="button" onClick={() => downloadBookingPdf(booking)} className="rounded-2xl bg-lime-400 py-3 font-semibold text-black shadow-lg shadow-lime-900/20 transition hover:bg-lime-300">Download Booking PDF</button>}
      <a href="/my-bookings" className="rounded-2xl border border-neutral-700 py-3 text-center font-semibold">View My Bookings</a>
      <a href="/booking" className="rounded-2xl border border-neutral-700 py-3 text-center font-semibold">Book Another Session</a>
    </div>
    <SelectedCoachWhatsAppLink booking={booking} bookings={group} />
  </CustomerShell>;
}

function CustomerPackageSummary({ packages, bookings }) {
  if (packages.length === 0) return <section className="mb-8 rounded-2xl border border-neutral-800 bg-neutral-950 p-5"><h2 className="text-xl font-semibold">My Package</h2><p className="mt-2 text-sm text-neutral-400">No package has been linked to your customer account yet. Your normal bookings remain available below.</p></section>;

  return <section className="mb-8"><h2 className="mb-3 text-xl font-semibold">My Package</h2><div className="grid gap-4 sm:grid-cols-2">{packages.map((packageRecord) => {
    const usage = getPackageUsage(bookings, packageRecord);
    const total = Number(packageRecord.totalPackageSessions || packageRecord.totalSessions || 0);
    const updatedAt = packageRecord.updatedAt?.toDate?.();
    return <article key={packageRecord.id} className="rounded-2xl border border-lime-400/30 bg-lime-400/5 p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm capitalize text-lime-300">{packageRecord.status || "active"}</p><h3 className="mt-1 text-lg font-semibold">{packageRecord.packageLabel || packageRecord.packageType || "Coaching Package"}</h3></div><span className="rounded-full bg-lime-400 px-3 py-1 text-sm font-semibold text-black">{usage.remainingSessions} left</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-800"><div className="h-full bg-lime-400" style={{ width: `${total > 0 ? Math.min(100, (usage.usedSessions / total) * 100) : 0}%` }} /></div><p className="mt-2 text-sm text-neutral-300">Used {usage.usedSessions} of {total} sessions</p><p className="mt-1 text-sm text-neutral-400">Payment: {packageRecord.paymentStatus || "Unpaid"}{packageRecord.paymentAmount ? ` · RM${packageRecord.paymentAmount}` : ""}</p>{packageRecord.notes && <p className="mt-3 rounded-xl bg-neutral-950 p-3 text-sm text-neutral-300">Coach note: {packageRecord.notes}</p>}<p className="mt-3 text-xs text-lime-300">{packageRecord.updateMessage || "Your coach updated this package."}</p><p className="mt-1 text-xs text-neutral-500">Updated by {packageRecord.updatedByName || packageRecord.coachName || "Coach"}{updatedAt ? ` · ${updatedAt.toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" })}` : ""}</p></article>;
  })}</div></section>;
}

function MyBookingsPage({ bookings, packages, user, profile }) {
  const own = bookings
    .filter((booking) => booking.customerId === user?.uid && !booking.isSlotLock)
    .map((booking) => ({ ...booking, status: getNormalizedBookingStatus(booking) }));
  const groups = [
    ["Pending Confirmation", own.filter((b) => b.status === "pending_confirmation")],
    ["Upcoming Bookings", own.filter((b) => ["confirmed"].includes(b.status) && b.date >= formatDate(new Date()))],
    ["Past Bookings", own.filter((b) => ["confirmed", "completed"].includes(b.status) && b.date < formatDate(new Date()))],
    ["Cancelled Bookings", own.filter((b) => ["cancelled", "expired"].includes(b.status))],
  ];
  return <CustomerShell user={user} profile={profile} title="My Bookings">
    <CustomerPackageSummary packages={packages} bookings={own} />
    {groups.map(([title, items]) => (
      <section key={title} className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">{title}</h2>
        <div className="space-y-3">
          {items.map((booking) => (
            <article key={booking.id} className="flex flex-col gap-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-lime-300">{booking.bookingReference || (booking.status === "confirmed" ? "Confirmed booking" : "Awaiting confirmation")}</p>
                  <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-xs capitalize text-neutral-400">{booking.status.replaceAll("_", " ")}</span>
                </div>
                <h3 className="mt-1 font-semibold">{booking.coachName}</h3>
                <p className="mt-1 text-sm text-neutral-300">{booking.date} · {booking.time} · {booking.duration} hour(s)</p>
                <p className="text-sm text-neutral-500">{booking.location}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2 text-sm sm:justify-end">
                <a href={`/my-bookings/${booking.id}`} className="rounded-xl border border-neutral-700 px-3 py-2">View Details</a>
                {booking.status === "confirmed" && <button type="button" onClick={() => downloadBookingPdf(booking)} className="rounded-xl border border-neutral-700 px-3 py-2">Download PDF</button>}
                {booking.status === "pending_confirmation" && <a href={`/booking/confirm/${booking.id}`} className="rounded-xl bg-lime-400 px-3 py-2 font-semibold text-black">Continue Confirmation</a>}
                {["expired", "cancelled"].includes(booking.status) && <a href="/booking" className="rounded-xl border border-neutral-700 px-3 py-2">Book Again</a>}
              </div>
            </article>
          ))}
          {items.length === 0 && <p className="text-sm text-neutral-500">No bookings in this section.</p>}
        </div>
      </section>
    ))}
  </CustomerShell>;
}

function BookingDetailPage({ booking, user, profile }) {
  if (!booking || booking.customerId !== user?.uid) return <CustomerShell user={user} profile={profile}><p>Booking not found.</p></CustomerShell>;
  return <CustomerShell user={user} profile={profile} title={booking.bookingReference || "Booking Detail"}><BookingDetails booking={booking} />{booking.status === "confirmed" && <button type="button" onClick={() => downloadBookingPdf(booking)} className="mt-6 rounded-2xl bg-lime-400 px-5 py-3 font-semibold text-black shadow-lg shadow-lime-900/20 transition hover:bg-lime-300">Download Booking PDF</button>}</CustomerShell>;
}

function ProfilePage({ user, profile }) {
  const [fullName, setFullName] = useState(profile?.fullName || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [status, setStatus] = useState("");
  async function save() {
    if (!fullName.trim() || !phone.trim()) return setStatus("Full name and phone are required.");
    await updateDoc(doc(db, "customers", user.uid), { fullName: fullName.trim(), phone: phone.trim(), updatedAt: serverTimestamp() });
    setStatus("Profile saved.");
  }
  return <CustomerShell user={user} profile={profile} title="My Profile"><label className="block text-sm">Full Name</label><input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-2 w-full rounded-2xl border border-neutral-700 bg-neutral-800 px-4 py-3" /><label className="mt-5 block text-sm">Google Email</label><div className="mt-2 rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-neutral-400">{user.email}</div><label className="mt-5 block text-sm">Phone Number</label><input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-2 w-full rounded-2xl border border-neutral-700 bg-neutral-800 px-4 py-3" /><button type="button" onClick={save} className="mt-6 rounded-2xl bg-lime-400 px-6 py-3 font-semibold text-black">Save Profile</button>{status && <p className="mt-3 text-sm">{status}</p>}</CustomerShell>;
}

function BookingPage({
  selectedArea,
  selectedService,
  coachingFormat,
  setCoachingFormat,
  editBookingId,
  customer,
  user,
  selectedCoachId,
  setSelectedCoachId,
  publicCoachOptions,
  date,
  setDate,
  selectedBookingTime,
  setTime,
  availableSlots,
  reservedForSelectedDate,
  location,
  setLocation,
  courtOption,
  setCourtOption,
  players,
  setPlayers,
  duration,
  setDuration,
  note,
  setNote,
  submitBooking,
  addBundleSession,
  removeBundleSession,
  clearBundleSessions,
  submitBundleBooking,
  bundleSessions,
  loading,
  status,
  calendarMonth,
  setCalendarMonth,
  monthLabel,
  monthDays,
  getDateStatus,
  selectedCoachBookings,
  groupParticipants,
  bookingCutoffApplies,
}) {
  const courtBookingUrl = getCourtBookingUrl(location, courtOption);
  const isFixedGroupCoaching = selectedService?.id === "group" || (selectedService?.id === "kids" && coachingFormat === "group");
  const areaDetails = trainingAreas[selectedArea] || trainingAreas.jb;

  return (
    <div className="premium-app-page premium-booking-page min-h-screen w-full max-w-full overflow-x-hidden bg-neutral-950 text-white">
      <div className="premium-booking-shell w-full max-w-6xl mx-auto px-4 py-8 sm:px-5 sm:py-12">
        <div className="premium-page-nav mb-6 flex items-center justify-between gap-3">
          <a href={areaDetails.slug} className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:border-lime-400 hover:text-lime-300 transition">
            Back
          </a>
          <div className="flex items-center gap-3"><a href="/my-bookings" className="text-sm text-neutral-300 hover:text-lime-300">My Bookings</a><button type="button" onClick={() => signOut(auth)} className="rounded-full border border-neutral-700 px-4 py-2 text-sm">Sign Out</button></div>
        </div>

        <div className="premium-booking-heading mb-8">
          <p className="inline-block rounded-full border border-lime-400/40 px-4 py-2 text-sm text-lime-300">
            Coach Ilham Academy - {areaDetails.name}
          </p>
          <h1 className="mt-5 text-3xl font-bold">Book Your Tennis Session</h1>
          <p className="mt-3 rounded-2xl bg-neutral-900 border border-neutral-800 px-4 py-3 text-sm text-neutral-200">
            Selected Service: <span className="font-semibold text-lime-300">{selectedService?.title || "General Tennis Coaching"}</span>
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          <div className="premium-panel premium-booking-form w-full max-w-full self-start bg-neutral-900 border border-neutral-800 rounded-3xl p-4 sm:p-6 md:p-8">
            <h2 className="text-2xl font-semibold mb-6">Booking Form</h2>

            <div className="space-y-4">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4"><p className="text-xs uppercase tracking-wide text-neutral-500">Booking For</p><p className="mt-2 font-semibold">{customer.fullName}</p><p className="text-sm text-neutral-400">{user.email}</p><p className="text-sm text-neutral-400">{customer.phone}</p></div>
              {selectedService?.id === "kids" && (
                <div className="premium-coaching-format">
                  <label>Coaching Option</label>
                  <div>
                    <button type="button" disabled={bundleSessions.length > 0} aria-pressed={coachingFormat === "private"} onClick={() => setCoachingFormat("private")} className={coachingFormat === "private" ? "is-selected" : ""}>
                      <strong>Private Coaching</strong>
                      <small>One-to-one or your own small group</small>
                    </button>
                    <button type="button" disabled={bundleSessions.length > 0} aria-pressed={coachingFormat === "group"} onClick={() => setCoachingFormat("group")} className={coachingFormat === "group" ? "is-selected" : ""}>
                      <strong>Group Coaching</strong>
                      <small>Join a scheduled group session</small>
                    </button>
                  </div>
                </div>
              )}
              {isFixedGroupCoaching && (
                <div className="premium-fixed-session-note">
                  <strong>Group Coaching - Every Tuesday</strong>
                  <span>8:00 PM - 10:00 PM - RM60 per player - Maximum 6 players.</span>
                </div>
              )}
              {!isFixedGroupCoaching && (
                <select
                  value={selectedCoachId}
                  onChange={(e) => setSelectedCoachId(e.target.value)}
                  disabled={bundleSessions.length > 0}
                  className="w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-lime-400"
                >
                  <option value="">Select Coach</option>
                  {publicCoachOptions.map((coach) => (
                    <option key={coach.coachId} value={coach.coachId}>
                      {coach.coachName}
                    </option>
                  ))}
                </select>
              )}
              <input type="date" min={selectedArea === "kl" ? kualaLumpurStartDate : undefined} max={bookingCutoffApplies ? customerBookingCutoffDate : undefined} value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-lime-400" />
              {selectedArea === "kl" && <p className="premium-booking-cutoff-note">Kuala Lumpur sessions begin from 1 October 2026.</p>}
              {bookingCutoffApplies && <p className="premium-booking-cutoff-note">Coach Ilham bookings are available up to 18 September 2026.</p>}

              {!isFixedGroupCoaching && <div className="premium-time-picker">
                <div className="premium-time-picker-head">
                  <span aria-hidden="true">-</span>
                  <span>{selectedCoachId ? `Available times - ${parseBookingDate(date).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}` : "Choose a coach to view available times"}</span>
                </div>
                {selectedCoachId && availableSlots.length > 0 ? (
                  <div className="premium-time-grid">
                    {availableSlots.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        aria-pressed={selectedBookingTime === slot}
                        onClick={() => setTime(slot)}
                        className={`premium-time-slot ${selectedBookingTime === slot ? "is-selected" : ""}`}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                ) : selectedCoachId ? (
                  <p className="premium-time-empty">No available slots for this date.</p>
                ) : null}
              </div>}

              {!isFixedGroupCoaching && !editBookingId && selectedCoachId && availableSlots.length > 0 && (
                <button type="button" onClick={addBundleSession} className="premium-bundle-add w-full border border-lime-400 px-4 py-3 font-semibold text-lime-300">
                  + Add this session to bundle
                </button>
              )}

              {bundleSessions.length > 0 && (
                <section className="premium-bundle-cart">
                  <div className="premium-bundle-cart-head">
                    <div><span>Session bundle</span><strong>{bundleSessions.length} session{bundleSessions.length === 1 ? "" : "s"}</strong></div>
                    <button type="button" onClick={clearBundleSessions}>Clear all</button>
                  </div>
                  <div className="premium-bundle-list">
                    {bundleSessions.map((session, index) => (
                      <article key={session.clientId}>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <div><strong>{session.date} · {session.time}</strong><small>{session.durationHours} hour(s) · {session.location}{session.courtOption ? ` · ${session.courtOption}` : ""}</small></div>
                        <button type="button" onClick={() => removeBundleSession(session.clientId)} aria-label={`Remove ${session.date} ${session.time}`}>&times;</button>
                      </article>
                    ))}
                  </div>
                  <p>Coach is locked to {bundleSessions[0].coachName}. Choose another date and time above to add more sessions.</p>
                </section>
              )}

              {!isFixedGroupCoaching && reservedForSelectedDate.length > 0 && (
                <p className="text-sm text-neutral-400">
                  Unavailable: {[...new Set(reservedForSelectedDate.map((slot) => slot.time))].join(", ")}
                </p>
              )}

              {!isFixedGroupCoaching && <select
                value={location}
                onChange={(e) => {
                  setLocation(e.target.value);
                  if (!requiresCourtOption(e.target.value)) setCourtOption("");
                }}
                className="w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-lime-400"
              >
                <option>{areaDetails.primaryLocation}</option>
                <option>Client Preferred Location</option>
              </select>}

              {!isFixedGroupCoaching && requiresCourtOption(location) && (
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                  <label className="text-sm font-semibold text-neutral-200">Court Option</label>
                  <select
                    value={courtOption}
                    onChange={(e) => setCourtOption(e.target.value)}
                    className="mt-3 w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-lime-400"
                  >
                    <option value="">Select indoor or outdoor court</option>
                    <option value="Indoor">Indoor Court</option>
                    <option value="Outdoor">Outdoor Court</option>
                  </select>
                  {courtBookingUrl && (
                    <a
                      href={courtBookingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="premium-court-booking-cta mt-3"
                    >
                      <span className="premium-court-booking-icon" aria-hidden="true">
                        <ExternalLink size={18} />
                      </span>
                      <span>
                        <strong>Check &amp; Book {courtOption} Court</strong>
                        <small>Court reservation opens on the official venue website</small>
                      </span>
                      <span className="premium-court-booking-arrow" aria-hidden="true">&rarr;</span>
                    </a>
                  )}
                </div>
              )}

              {!isFixedGroupCoaching && <div className="grid grid-cols-2 gap-4">
                <select value={players} onChange={(e) => setPlayers(Number(e.target.value))} className="rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-lime-400">
                  <option value={1}>1 Player</option>
                  <option value={2}>2 Players</option>
                  <option value={3}>3 Players</option>
                  <option value={4}>4 Players</option>
                </select>
                <div className="relative">
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={duration}
                    disabled={isFixedGroupCoaching}
                    onChange={(e) => setDuration(e.target.value)}
                    onBlur={() => {
                      if (!isFixedGroupCoaching && (!duration || Number(duration) < 1)) {
                        setDuration("1");
                      }
                    }}
                    placeholder="1 hour"
                    className="w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 pr-20 outline-none focus:border-lime-400"
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-neutral-400">
                    {isFixedGroupCoaching ? "fixed hours" : "hours"}
                  </span>
                </div>
              </div>}

              {isFixedGroupCoaching && (
                <section className="premium-group-roster">
                  <div className="premium-group-roster-head">
                    <div><span>Players joining</span><strong>{groupParticipants.length} / {groupCoachingCapacity} registered</strong></div>
                    <div>RM{groupCoachingFeePerPlayer}<small>per player</small></div>
                  </div>
                  {groupParticipants.length > 0 ? (
                    <ol>{groupParticipants.map((participant, index) => <li key={participant.id || `${participant.customerName}-${index}`}><span>{index + 1}</span><strong>{participant.customerName || participant.name || "Registered player"}</strong></li>)}</ol>
                  ) : (
                    <p>Be the first player to join this session.</p>
                  )}
                  {groupParticipants.length < groupCoachingCapacity && (
                    <p className="premium-group-seats-left">{groupCoachingCapacity - groupParticipants.length} place{groupCoachingCapacity - groupParticipants.length === 1 ? "" : "s"} remaining</p>
                  )}
                </section>
              )}

              {!isFixedGroupCoaching && <textarea rows="4" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notes" className="w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-lime-400" />}

              <button onClick={bundleSessions.length > 0 ? submitBundleBooking : submitBooking} disabled={loading || (isFixedGroupCoaching ? groupParticipants.length >= groupCoachingCapacity || availableSlots.length === 0 : (!bundleSessions.length && (!selectedCoachId || availableSlots.length === 0)))} className="w-full bg-white text-black rounded-2xl py-4 font-semibold hover:bg-neutral-200 transition disabled:opacity-50">
                {loading ? "Please wait..." : isFixedGroupCoaching ? groupParticipants.length >= groupCoachingCapacity ? "Group Full" : "Register for Group Coaching - RM60" : bundleSessions.length > 0 ? `Reserve Bundle (${bundleSessions.length})` : "Book Now"}
              </button>

              {status && <p className="text-sm text-neutral-300">{status}</p>}
            </div>
          </div>

          <div className="space-y-6">
            <div className="premium-panel premium-calendar bg-neutral-900 border border-neutral-800 rounded-3xl p-6 md:p-8">
              <div className="flex items-center justify-between gap-3 mb-6">
                <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} className="rounded-xl border border-neutral-700 px-3 py-2">&larr;</button>
                <h2 className="text-2xl font-semibold text-center">{monthLabel}</h2>
                <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} className="rounded-xl border border-neutral-700 px-3 py-2">&rarr;</button>
              </div>

              <div className="grid grid-cols-7 gap-2 text-center text-xs text-neutral-400 mb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day}>{day}</div>)}
              </div>

              <div className="grid grid-cols-7 gap-2">
                {monthDays.map((day, index) => {
                  const dayString = day ? formatDate(day) : "";
                  const dayStatus = getDateStatus(day);
                  const isFullDay = dayStatus === "full";
                  const isSelected = dayString === date;
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const isPast = day && day < today;
                  const isUnavailableGroupDay = Boolean(day && isFixedGroupCoaching && day.getDay() !== 2);
                  const isAfterCutoff = Boolean(day && bookingCutoffApplies && isAfterCustomerBookingCutoff(day));
                  const isBeforeAreaStart = Boolean(day && selectedArea === "kl" && isBeforeKualaLumpurStart(day));

                  return (
                    <button
                      key={index}
                      disabled={!day || isPast || isUnavailableGroupDay || isAfterCutoff || isBeforeAreaStart}
                      onClick={() => day && setDate(dayString)}
                      className={`min-h-20 rounded-2xl border p-2 text-left transition ${isPast || isUnavailableGroupDay || isAfterCutoff || isBeforeAreaStart
                        ? "opacity-30 cursor-not-allowed border-neutral-900 bg-neutral-950"
                        : isSelected
                          ? "border-lime-400 bg-lime-400 text-black"
                          : "border-neutral-800 bg-neutral-950 hover:border-neutral-600"
                        } ${!day ? "opacity-0" : ""}`}
                    >
                      {day && (
                        <>
                          <div className={`font-semibold ${isFullDay ? "line-through decoration-2" : ""}`}>{day.getDate()}</div>
                          {!isFullDay && (
                            <div className={`mt-2 text-[10px] ${isSelected ? "text-black" : "text-lime-300"}`}>
                              {dayStatus}
                            </div>
                          )}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <WeeklySchedule
              bookings={selectedCoachBookings}
              selectedDate={date}
              onSelectDate={setDate}
              className="min-h-[600px] flex flex-col"
              contentClassName="min-h-[520px] flex-1"
              hideBookingNames
            />

            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 md:p-8">
              <h2 className="text-2xl font-semibold mb-3">{areaDetails.primaryLocation}</h2>
              <p className="text-neutral-300">Coordinate the court booking with your selected coaching time before confirming the session. You may also choose Client Preferred Location.</p>
              <a href={selectedArea === "kl" ? jalanDutaCourtUrl : "https://booking.stadiumjohor.my/product-tag/tennis/"} target="_blank" rel="noreferrer" className="inline-block mt-6 text-lime-400 hover:text-lime-300">Check official court availability &rarr;</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const currentPath = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);
  const pathArea = getAreaFromPath(currentPath);
  const selectedArea = (() => {
    const queryArea = searchParams.get("area");
    return queryArea === "jb" ? "jb" : pathArea || getStoredTrainingArea() || "jb";
  })();
  const isAdminPage = currentPath === "/admin";
  const isBookingPage = currentPath === "/booking";
  const confirmationBookingId = currentPath.match(/^\/booking\/confirm\/([^/]+)$/)?.[1] || "";
  const successBookingId = currentPath.match(/^\/booking\/success\/([^/]+)$/)?.[1] || "";
  const detailBookingId = currentPath.match(/^\/my-bookings\/([^/]+)$/)?.[1] || "";
  const isCustomerPage = isBookingPage || Boolean(confirmationBookingId || successBookingId || detailBookingId) || ["/my-bookings", "/my-profile"].includes(currentPath);
  const editBookingId = searchParams.get("edit") || "";
  const selectedService = getServiceById(searchParams.get("service"));
  // Kept for the legacy, unreachable booking markup below until that historical block is removed.
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  void name;
  void phone;
  const [players, setPlayers] = useState(1);
  const [duration, setDuration] = useState("1");
  const [date, setDate] = useState(() => selectedArea === "kl" && isBeforeKualaLumpurStart(new Date()) ? kualaLumpurStartDate : formatDate(new Date()));
  const [time, setTime] = useState("8:00 AM");
  const [location, setLocation] = useState(() => trainingAreas[selectedArea]?.primaryLocation || trainingAreas.jb.primaryLocation);
  const [courtOption, setCourtOption] = useState("");
  const [coachingFormat, setCoachingFormat] = useState(() => selectedService?.id === "group" ? "group" : selectedService?.id === "sparring" ? "sparring" : "private");
  const [selectedCoachId, setSelectedCoachId] = useState("");
  const [note, setNote] = useState("");
  const [bundleSessions, setBundleSessions] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [packages, setPackages] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [transferLogs, setTransferLogs] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [adminUser, setAdminUser] = useState(null);
  const [adminProfile, setAdminProfile] = useState(null);
  const [customerProfile, setCustomerProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [draftBookingId] = useState(() => doc(collection(db, "bookings")).id);
  const submittingRef = useRef(false);
  const customerBookingDataRef = useRef({ own: [], locks: [] });
  const syncedLegacyBookingIdsRef = useRef(new Set());
  const expiringBookingIdsRef = useRef(new Set());
  const staleLockCleanupStartedRef = useRef(false);

  const durationHours = getBookingDuration({ duration });
  const isFixedGroupCoaching = selectedService?.id === "group" || (selectedService?.id === "kids" && coachingFormat === "group");
  const price = useMemo(() => isFixedGroupCoaching ? groupCoachingFeePerPlayer : calculateCoachingFee(players, durationHours), [durationHours, isFixedGroupCoaching, players]);
  const selectedCoachBookings = useMemo(() => {
    if (!selectedCoachId) return [];

    const selectedCoachRecord = coaches.find((coach) => coach.coachId === selectedCoachId);
    const selectedCoachName =
      selectedCoachRecord?.coachName ||
      selectedCoachRecord?.name ||
      selectedCoachRecord?.email ||
      "";
    const isSelectedSuperAdmin = selectedCoachRecord?.role === roles.SUPER_ADMIN;
    const isSelectedPrimaryIlham = isPrimaryIlhamCoachName(selectedCoachName);

    return bookings.filter((booking) => {
      const bookingCoachId = String(booking.coachId || booking.createdBy || "");
      const bookingCoachName = booking.coachName || "";

      if (bookingCoachId) {
        return (
          bookingCoachId === selectedCoachId ||
          (isSelectedPrimaryIlham && isPrimaryIlhamCoachName(bookingCoachName))
        );
      }

      return isSelectedSuperAdmin || isSelectedPrimaryIlham;
    });
  }, [bookings, coaches, selectedCoachId]);

  const reservedForSelectedDate = useMemo(() => {
    if (!selectedCoachId) return [];

    const dayRange = {
      start: parseBookingDate(date),
      end: parseBookingDate(date),
    };
    dayRange.end.setDate(dayRange.end.getDate() + 1);

    return getExpandedReservedSlots(selectedCoachBookings, dayRange);
  }, [date, selectedCoachBookings, selectedCoachId]);

  const bookingCutoffApplies = useMemo(() => {
    if (!selectedCoachId || selectedArea === "kl") return false;
    const selectedCoachRecord = coaches.find((coach) => coach.coachId === selectedCoachId || coach.id === selectedCoachId);
    const coachName = selectedCoachRecord?.coachName || selectedCoachRecord?.name || selectedCoachRecord?.email || "";
    return isPrimaryIlhamCoachName(coachName) || selectedCoachRecord?.role === roles.SUPER_ADMIN;
  }, [coaches, selectedArea, selectedCoachId]);

  const groupParticipants = useMemo(() => {
    if (!isFixedGroupCoaching) return [];
    return bookings
      .filter((booking) => {
        if (!booking.isSlotLock || !isGroupCoachingBooking(booking) || booking.date !== date) return false;
        return isReservedBooking(booking);
      })
      .sort((a, b) => Number(a.groupSeatNumber || 0) - Number(b.groupSeatNumber || 0));
  }, [bookings, date, isFixedGroupCoaching]);

  const availableSlots = useMemo(() => {
    if (!selectedCoachId || (selectedArea === "kl" && isBeforeKualaLumpurStart(date)) || (bookingCutoffApplies && isAfterCustomerBookingCutoff(date))) return [];

    const candidateSlots = isFixedGroupCoaching
      ? (parseBookingDate(date).getDay() === 2 && groupParticipants.length < groupCoachingCapacity ? ["8:00 PM"] : [])
      : allTimeSlots;

    return candidateSlots.filter(
      (slot) =>
        !isPastTimeSlot(date, slot) &&
        (isFixedGroupCoaching || !hasBookingOverlap(selectedCoachBookings, date, slot, durationHours))
    );
  }, [bookingCutoffApplies, date, durationHours, groupParticipants.length, isFixedGroupCoaching, selectedArea, selectedCoachBookings, selectedCoachId]);
  const selectedBookingTime = availableSlots.includes(time) ? time : availableSlots[0] || "";
  const publicCoachOptions = useMemo(() => {
    const coachesById = new Map();

    coaches.forEach((coach) => {
      if (![roles.COACH, roles.SUPER_ADMIN].includes(coach.role)) return;
      if (coach.status !== "active") return;
      if (coach.active !== true) return;
      if (!coach.coachId) return;
      if (!coachesById.has(coach.coachId)) {
        coachesById.set(coach.coachId, {
          coachId: coach.coachId,
          coachName: getCoachDisplayName(coach.coachName || coach.name || coach.email || coach.coachId || "Coach"),
          coachEmail: coach.coachEmail || coach.email || "",
          coachPhone: coach.coachPhone || coach.phone || coach.whatsapp || (isPrimaryIlhamCoachName(coach.coachName || coach.name || coach.email) ? primaryIlhamWhatsAppNumber : ""),
          role: coach.role,
        });
      }
    });

    const areaCoaches = Array.from(coachesById.values()).filter((coach) => {
      const isCoachIlham = coach.role === roles.SUPER_ADMIN || isPrimaryIlhamCoachName(coach.coachName);
      if (selectedArea === "kl") return isCoachIlham;
      if (selectedArea === "jb") return true;
      return true;
    });

    return areaCoaches.sort((a, b) => {
      return String(a.coachName || "").localeCompare(String(b.coachName || ""));
    });
  }, [coaches, selectedArea]);
  const selectedCoach = publicCoachOptions.find((coach) => coach.coachId === selectedCoachId) || null;
  const selectedCoachAvailabilityIds = useMemo(() => {
    if (!selectedCoachId) return [];

    const selectedCoachRecord = coaches.find((coach) => coach.coachId === selectedCoachId);
    const coachName = selectedCoachRecord?.coachName || selectedCoachRecord?.name || selectedCoach?.coachName || "";
    const ids = new Set([selectedCoachId]);

    if (selectedCoachRecord?.id) ids.add(selectedCoachRecord.id);
    if (isPrimaryIlhamCoachName(coachName) || selectedCoachRecord?.role === roles.SUPER_ADMIN) {
      ids.add("UID_SUPER_ADMIN");
      ids.add("");
    }

    return Array.from(ids);
  }, [coaches, selectedCoach, selectedCoachId]);

  function refreshBookings() {
    setStatus("Bookings update automatically from Firebase.");
  }

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (availableSlots.length === 0) {
      setTime("");
      return;
    }

    if (!availableSlots.includes(time)) {
      setTime(availableSlots[0]);
    }
  }, [availableSlots, time]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setAdminUser(nextUser);

      if (!nextUser) {
        setAdminProfile(null);
        setCustomerProfile(null);
        setAuthLoading(false);
        return;
      }

      try {
        if (!isAdminPage) {
          const isGoogleAccount = nextUser.providerData.some((provider) => provider.providerId === "google.com") && !String(nextUser.email || "").endsWith("@ilham-booking.local");
          if (!isGoogleAccount) {
            setCustomerProfile(null);
            return;
          }
          const customerRef = doc(db, "customers", nextUser.uid);
          const customerSnapshot = await getDoc(customerRef);
          const existingCustomer = customerSnapshot.exists() ? customerSnapshot.data() : null;
          if (!existingCustomer) {
            const initialCustomer = {
              uid: nextUser.uid,
              fullName: nextUser.displayName || "",
              email: nextUser.email || "",
              phone: "",
              photoURL: nextUser.photoURL || "",
              provider: "google",
              role: "customer",
              profileCompleted: false,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            await setDoc(customerRef, initialCustomer);
            setCustomerProfile(initialCustomer);
          } else {
            setCustomerProfile(existingCustomer);
          }
          return;
        }

        const defaultProfile = getDefaultAdminProfile(nextUser);
        const userRef = doc(db, "users", nextUser.uid);
        const userSnapshot = await getDoc(userRef);
        const profile = userSnapshot.exists() ? userSnapshot.data() : {};
        const isKnownInternalAdmin = defaultProfile.role !== roles.VIEWER;

        if (!userSnapshot.exists() && !isKnownInternalAdmin) {
          await setDoc(userRef, {
            uid: nextUser.uid,
            name: nextUser.displayName || nextUser.email || "",
            email: nextUser.email || "",
            phone: nextUser.phoneNumber || "",
            photoURL: nextUser.photoURL || "",
            role: roles.PENDING_COACH,
            status: "pending",
            active: false,
            coachId: nextUser.uid,
            coachName: nextUser.displayName || nextUser.email || "",
            coachEmail: nextUser.email || "",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          setAdminProfile({
            role: roles.PENDING_COACH,
            status: "pending",
            coachId: nextUser.uid,
            coachName: nextUser.displayName || nextUser.email || "",
            coachEmail: nextUser.email || "",
            photoURL: nextUser.photoURL || "",
          });
          return;
        }

        setAdminProfile({
          role: profile.role || defaultProfile.role,
          status: profile.status || (isKnownInternalAdmin ? "active" : "pending"),
          active: profile.active ?? isKnownInternalAdmin,
          coachId: profile.coachId || defaultProfile.coachId || nextUser.uid,
          coachName: profile.coachName || profile.name || defaultProfile.coachName,
          coachEmail: profile.coachEmail || profile.email || defaultProfile.coachEmail,
          photoURL: profile.photoURL || nextUser.photoURL || "",
        });
      } catch (error) {
        console.error(error);
        setAdminProfile(getDefaultAdminProfile(nextUser));
      } finally {
        setAuthLoading(false);
      }
    });

    return unsubscribe;
  }, [isAdminPage]);

  /* Loading an existing pending draft intentionally hydrates the controlled form. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!editBookingId || !adminUser) return;
    const booking = bookings.find((item) => item.id === editBookingId && item.customerId === adminUser.uid && item.status === "pending_confirmation");
    if (!booking) return;
    setPlayers(Number(booking.players || 1));
    setDuration(String(booking.durationHours || booking.duration || 1));
    setDate(booking.date || formatDate(new Date()));
    setTime(booking.startTime || booking.time || "");
    setLocation(booking.location || "Tennis Nusa Duta");
    setCourtOption(booking.court || booking.courtOption || "");
    setSelectedCoachId(booking.coachId || "");
    setCoachingFormat(booking.coachingFormat || (booking.serviceType === "group" ? "group" : booking.serviceType === "sparring" ? "sparring" : "private"));
    setNote(booking.notes || booking.note || "");
  }, [adminUser, bookings, editBookingId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* Keep the booking format aligned with services that have a fixed format. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (editBookingId) return;
    if (selectedService?.id === "group") setCoachingFormat("group");
    else if (selectedService?.id === "sparring") setCoachingFormat("sparring");
    else if (selectedService?.id !== "kids") setCoachingFormat("private");
  }, [editBookingId, selectedService?.id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* Group coaching currently runs as one fixed two-hour session every Tuesday. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isFixedGroupCoaching || editBookingId) return;
    setDuration("2");
    setTime("8:00 PM");

    const selected = parseBookingDate(date);
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const selectedSessionHasPassed = formatDate(selected) === formatDate(today) && isPastTimeSlot(formatDate(today), "8:00 PM");
    if (selected.getDay() !== 2 || selected < today || selectedSessionHasPassed) {
      const searchFrom = new Date(today);
      if (today.getDay() === 2 && isPastTimeSlot(formatDate(today), "8:00 PM")) {
        searchFrom.setDate(searchFrom.getDate() + 1);
      }
      setDate(getNextTuesdayDate(searchFrom));
    }
  }, [date, editBookingId, isFixedGroupCoaching]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* The coach is assigned automatically for group registration and stays hidden from customers. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isFixedGroupCoaching || editBookingId || bundleSessions.length > 0 || publicCoachOptions.length === 0) return;
    const assignedCoach = publicCoachOptions.find((coach) => isPrimaryIlhamCoachName(coach.coachName)) || publicCoachOptions[0];
    if (assignedCoach && selectedCoachId !== assignedCoach.coachId) setSelectedCoachId(assignedCoach.coachId);
  }, [bundleSessions.length, editBookingId, isFixedGroupCoaching, publicCoachOptions, selectedCoachId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* Kuala Lumpur launches with Coach Ilham on 1 October 2026. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (selectedArea !== "kl" || editBookingId) return;
    if (isBeforeKualaLumpurStart(date)) {
      const launchDate = parseBookingDate(kualaLumpurStartDate);
      setDate(isFixedGroupCoaching ? getNextTuesdayDate(launchDate) : kualaLumpurStartDate);
      setCalendarMonth(launchDate);
    }
    if (publicCoachOptions.length === 1 && selectedCoachId !== publicCoachOptions[0].coachId) {
      setSelectedCoachId(publicCoachOptions[0].coachId);
    }
  }, [date, editBookingId, isFixedGroupCoaching, publicCoachOptions, selectedArea, selectedCoachId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!adminUser || isAdminPage) return undefined;
    return onSnapshot(doc(db, "customers", adminUser.uid), (snapshot) => {
      if (snapshot.exists()) setCustomerProfile(snapshot.data());
    });
  }, [adminUser, isAdminPage]);

  useEffect(() => {
    if (!isAdminPage || getUserRole(adminProfile) !== roles.SUPER_ADMIN) return;
    const unsynced = bookings.filter((booking) => !syncedLegacyBookingIdsRef.current.has(booking.id) && isReservedBooking(booking));
    if (unsynced.length === 0) return;

    async function backfillAvailabilityLocks() {
      unsynced.forEach((booking) => syncedLegacyBookingIdsRef.current.add(booking.id));
      const writes = [];
      unsynced.forEach((booking) => {
        getRequestedSlotKeys(booking.date, booking.startTime || booking.time, booking.durationHours || booking.duration).forEach((slot) => writes.push({ booking, slot }));
      });
      for (let offset = 0; offset < writes.length; offset += 400) {
        const batch = writeBatch(db);
        writes.slice(offset, offset + 400).forEach(({ booking, slot }) => {
          batch.set(doc(db, "availabilityLocks", getSlotLockId(booking.coachId || booking.createdBy, booking.date, slot)), {
            bookingId: booking.id,
            customerId: booking.customerId || "",
            coachId: booking.coachId || booking.createdBy || "",
            date: booking.date,
            time: getAvailabilityLockTime({ date: booking.date, time: slot }),
            status: String(booking.status || booking.type || "confirmed").toLowerCase() === "blocked" ? "blocked" : "confirmed",
            confirmationExpiresAt: null,
            updatedAt: serverTimestamp(),
          }, { merge: true });
        });
        await batch.commit();
      }
    }
    backfillAvailabilityLocks().catch((error) => console.error("Availability lock backfill failed", error));
  }, [adminProfile, adminUser, bookings, isAdminPage]);

  useEffect(() => {
    if (!isAdminPage || getUserRole(adminProfile) !== roles.SUPER_ADMIN || bookings.length === 0 || staleLockCleanupStartedRef.current) return;
    staleLockCleanupStartedRef.current = true;

    async function cleanupStaleAvailabilityLocks() {
      const cleanupRef = doc(db, "system", "availabilityLockCleanupV2");
      const cleanupSnapshot = await getDoc(cleanupRef);
      if (cleanupSnapshot.exists()) return;

      const bookingsById = new Map(bookings.map((booking) => [booking.id, booking]));
      const lockSnapshot = await getDocs(collection(db, "availabilityLocks"));
      const staleLocks = lockSnapshot.docs.filter((lockDoc) => {
        const bookingId = lockDoc.data().bookingId;
        if (!bookingId) return false;
        const booking = bookingsById.get(bookingId);
        return !booking || !isReservedBooking(booking);
      });

      for (let offset = 0; offset < staleLocks.length; offset += 400) {
        const batch = writeBatch(db);
        staleLocks.slice(offset, offset + 400).forEach((lockDoc) => batch.delete(lockDoc.ref));
        await batch.commit();
      }

      await setDoc(cleanupRef, {
        completed: true,
        removedLockCount: staleLocks.length,
        completedAt: serverTimestamp(),
        completedBy: adminUser?.uid || "",
      });
    }

    cleanupStaleAvailabilityLocks().catch((error) => {
      staleLockCleanupStartedRef.current = false;
      console.error("Stale availability lock cleanup failed", error);
    });
  }, [adminProfile, adminUser, bookings, isAdminPage]);

  useEffect(() => {
    if (!adminUser || isAdminPage) return;
    bookings.filter((booking) => !booking.isSlotLock && booking.customerId === adminUser.uid && booking.status === "pending_confirmation" && (booking.confirmationExpiresAt?.toMillis?.() || Infinity) <= Date.now() && !expiringBookingIdsRef.current.has(booking.id)).forEach((booking) => {
      expiringBookingIdsRef.current.add(booking.id);
      runTransaction(db, async (transaction) => {
        const bookingRef = doc(db, "bookings", booking.id);
        const currentSnapshot = await transaction.get(bookingRef);
        if (!currentSnapshot.exists()) return;
        const current = currentSnapshot.data();
        if (current.status !== "pending_confirmation" || (current.confirmationExpiresAt?.toMillis?.() || Infinity) > Date.now()) return;
        const lockRefs = isGroupCoachingBooking(current) && current.groupSeatNumber
          ? [doc(db, "availabilityLocks", getGroupSeatLockId(current.coachId, current.date, current.groupSeatNumber))]
          : getRequestedSlotKeys(current.date, current.startTime || current.time, current.durationHours || current.duration).map((slot) => doc(db, "availabilityLocks", getSlotLockId(current.coachId, current.date, slot)));
        const locks = [];
        for (const lockRef of lockRefs) locks.push(await transaction.get(lockRef));
        transaction.update(bookingRef, { status: "expired", bookingStatus: "Expired", updatedAt: serverTimestamp() });
        lockRefs.forEach((lockRef, index) => { if (locks[index].exists() && locks[index].data().bookingId === booking.id) transaction.delete(lockRef); });
      }).catch((error) => { expiringBookingIdsRef.current.delete(booking.id); console.error("Expired booking cleanup failed", error); });
    });
  }, [adminUser, bookings, isAdminPage]);

  useEffect(() => {
    if (!adminUser) {
      return undefined;
    }
    const sortAndSet = (items) => setBookings(items.map(normalizeCoachDisplayFields).sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || allTimeSlots.indexOf(a.time) - allTimeSlots.indexOf(b.time)));
    if (isAdminPage) {
      if (!adminProfile) return undefined;
      const bookingSource = getUserRole(adminProfile) === roles.SUPER_ADMIN ? collection(db, "bookings") : query(collection(db, "bookings"), where("coachId", "==", getCoachId(adminUser, adminProfile)));
      return onSnapshot(bookingSource, (snapshot) => {
        sortAndSet(snapshot.docs.map((bookingDoc) => ({ id: bookingDoc.id, ...bookingDoc.data() })));
      }, (error) => { console.error(error); setStatus("Could not load Firebase bookings. Please check Firebase config and Firestore rules."); });
    }

    const updateCustomerBookings = () => sortAndSet([...customerBookingDataRef.current.own, ...customerBookingDataRef.current.locks]);
    const unsubscribeOwn = onSnapshot(query(collection(db, "bookings"), where("customerId", "==", adminUser.uid)), (snapshot) => {
      customerBookingDataRef.current.own = snapshot.docs.map((bookingDoc) => ({ id: bookingDoc.id, ...bookingDoc.data() }));
      updateCustomerBookings();
    }, console.error);
    let unsubscribeLocks = () => {};
    if (selectedCoachId && selectedCoachAvailabilityIds.length > 0) {
      const lockSource = selectedCoachAvailabilityIds.length === 1
        ? query(collection(db, "availabilityLocks"), where("coachId", "==", selectedCoachId))
        : query(collection(db, "availabilityLocks"), where("coachId", "in", selectedCoachAvailabilityIds));
      unsubscribeLocks = onSnapshot(lockSource, (snapshot) => {
        customerBookingDataRef.current.locks = snapshot.docs.map((lockDoc) => ({
          id: `lock-${lockDoc.id}`,
          ...lockDoc.data(),
          sourceCoachId: lockDoc.data().coachId || "",
          coachId: selectedCoachId,
          time: getAvailabilityLockTime(lockDoc.data()),
          duration: Number(lockDoc.data().duration || 1),
          bookingStatus: lockDoc.data().status,
          isSlotLock: true,
        }));
        updateCustomerBookings();
      }, console.error);
    } else {
      customerBookingDataRef.current.locks = [];
      updateCustomerBookings();
    }
    return () => { unsubscribeOwn(); unsubscribeLocks(); };
  }, [adminProfile, adminUser, isAdminPage, selectedCoachAvailabilityIds, selectedCoachId]);

  useEffect(() => {
    if (!adminUser) return undefined;
    let packageSource;
    if (isAdminPage) {
      if (!adminProfile) return undefined;
      packageSource = getUserRole(adminProfile) === roles.SUPER_ADMIN ? collection(db, "packages") : query(collection(db, "packages"), where("coachId", "==", getCoachId(adminUser, adminProfile)));
    } else {
      packageSource = query(collection(db, "packages"), where("customerId", "==", adminUser.uid));
    }
    const unsubscribe = onSnapshot(
      packageSource,
      (snapshot) => {
        const nextPackages = snapshot.docs.map((packageDoc) => normalizeCoachDisplayFields({
          id: packageDoc.id,
          ...packageDoc.data(),
        }));

        nextPackages.sort((a, b) => {
          return String(a.studentName || "").localeCompare(String(b.studentName || ""));
        });

        setPackages(nextPackages);
      },
      (error) => {
        console.error(error);
        if (isAdminPage) setStatus("Could not load Firebase packages. Please check Firestore rules.");
      }
    );

    return unsubscribe;
  }, [adminProfile, adminUser, isAdminPage]);

  useEffect(() => {
    if (!adminUser || !isAdminPage || ![roles.SUPER_ADMIN, roles.COACH].includes(getUserRole(adminProfile))) return undefined;
    const notificationSource = getUserRole(adminProfile) === roles.SUPER_ADMIN
      ? collection(db, "notifications")
      : query(collection(db, "notifications"), where("coachId", "==", getCoachId(adminUser, adminProfile)));
    const unsubscribe = onSnapshot(
      notificationSource,
      (snapshot) => {
        const nextNotifications = snapshot.docs.map((notificationDoc) => normalizeCoachDisplayFields({
          id: notificationDoc.id,
          ...notificationDoc.data(),
        }));

        nextNotifications.sort((a, b) => {
          const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
          const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
          return bTime - aTime;
        });

        setNotifications(nextNotifications);
      },
      (error) => {
        console.error(error);
      }
    );

    return unsubscribe;
  }, [adminProfile, adminUser, isAdminPage]);

  useEffect(() => {
    if (!adminUser || !isAdminPage || getUserRole(adminProfile) !== roles.SUPER_ADMIN) return undefined;
    return onSnapshot(collection(db, "customers"), (snapshot) => {
      const nextCustomers = snapshot.docs.map((customerDoc) => ({ id: customerDoc.id, ...customerDoc.data() }));
      nextCustomers.sort((a, b) => String(a.fullName || a.email || "").localeCompare(String(b.fullName || b.email || "")));
      setCustomers(nextCustomers);
    }, (error) => console.error("Could not load customers for package linking", error));
  }, [adminProfile, adminUser, isAdminPage]);

  useEffect(() => {
    if (!adminUser) return undefined;
    const unsubscribe = onSnapshot(
      collection(db, "coaches"),
      (snapshot) => {
        const nextCoaches = snapshot.docs.map((coachDoc) => normalizeCoachDisplayFields({
          id: coachDoc.id,
          coachId: coachDoc.data().coachId || coachDoc.id,
          ...coachDoc.data(),
        }));

        nextCoaches.sort((a, b) => String(a.coachName || "").localeCompare(String(b.coachName || "")));
        setCoaches(nextCoaches);
      },
      (error) => {
        console.error(error);
      }
    );

    return unsubscribe;
  }, [adminUser]);

  useEffect(() => {
    if (!adminUser || !isAdminPage || getUserRole(adminProfile) !== roles.SUPER_ADMIN) return undefined;
    const unsubscribe = onSnapshot(
      collection(db, "transferLogs"),
      (snapshot) => {
        const nextLogs = snapshot.docs.map((logDoc) => normalizeCoachDisplayFields({
          id: logDoc.id,
          ...logDoc.data(),
        }));

        nextLogs.sort((a, b) => {
          const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
          const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
          return bTime - aTime;
        });

        setTransferLogs(nextLogs);
      },
      (error) => {
        console.error(error);
      }
    );

    return unsubscribe;
  }, [adminProfile, adminUser, isAdminPage]);

  useEffect(() => {
    if (!adminUser || !isAdminPage || getUserRole(adminProfile) !== roles.SUPER_ADMIN) return undefined;
    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const nextUsers = snapshot.docs.map((userDoc) => {
          const userData = userDoc.data();
          const normalized = normalizeCoachDisplayFields({
            id: userDoc.id,
            uid: userData.uid || userDoc.id,
            ...userData,
          });
          return [roles.COACH, roles.SUPER_ADMIN].includes(userData.role)
            ? { ...normalized, name: getCoachDisplayName(normalized.name) }
            : normalized;
        });

        nextUsers.sort((a, b) => String(a.name || a.email || "").localeCompare(String(b.name || b.email || "")));
        setUsers(nextUsers);
      },
      (error) => {
        console.error(error);
      }
    );

    return unsubscribe;
  }, [adminProfile, adminUser, isAdminPage]);

  useEffect(() => {
    if (!adminUser || !isAdminPage || !adminProfile) return undefined;
    const leaveRequestSource = getUserRole(adminProfile) === roles.SUPER_ADMIN ? collection(db, "leaveRequests") : query(collection(db, "leaveRequests"), where("coachId", "==", getCoachId(adminUser, adminProfile)));
    const unsubscribe = onSnapshot(
      leaveRequestSource,
      (snapshot) => {
        const nextRequests = snapshot.docs.map((requestDoc) => ({
          id: requestDoc.id,
          ...requestDoc.data(),
        }));

        nextRequests.sort((a, b) => {
          const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
          const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
          return bTime - aTime;
        });

        setLeaveRequests(nextRequests);
      },
      (error) => {
        console.error(error);
      }
    );

    return unsubscribe;
  }, [adminProfile, adminUser, isAdminPage]);

  function addBundleSession() {
    if (!date || !selectedBookingTime || !selectedCoach) return setStatus("Please select a date, time and coach.");
    if (selectedArea === "kl" && isBeforeKualaLumpurStart(date)) return setStatus("Kuala Lumpur bookings begin from 1 October 2026.");
    if (bookingCutoffApplies && isAfterCustomerBookingCutoff(date)) return setStatus("Coach Ilham bookings are closed after 18 September 2026.");
    if (isFixedGroupCoaching && (parseBookingDate(date).getDay() !== 2 || selectedBookingTime !== "8:00 PM" || durationHours !== 2)) {
      return setStatus("Group Coaching is only available every Tuesday from 8:00 PM to 10:00 PM.");
    }
    if (requiresCourtOption(location) && !courtOption) return setStatus("Please choose Indoor Court or Outdoor Court.");
    if (bundleSessions.length >= 12) return setStatus("A bundle can contain up to 12 sessions.");
    if (bundleSessions.length > 0 && bundleSessions[0].coachId !== selectedCoach.coachId) return setStatus("All bundle sessions must use the same coach.");

    const requested = getRequestedSlotKeys(date, selectedBookingTime, durationHours);
    const overlapsBundle = bundleSessions.some((session) => {
      if (session.date !== date) return false;
      const existing = getRequestedSlotKeys(session.date, session.time, session.durationHours);
      return requested.some((slot) => existing.includes(slot));
    });
    if (overlapsBundle) return setStatus("This session overlaps another session already in your bundle.");

    const clientId = `${selectedCoach.coachId}_${date}_${selectedBookingTime}_${durationHours}`;
    setBundleSessions((sessions) => [...sessions, {
      clientId,
      coachId: selectedCoach.coachId,
      coachName: selectedCoach.coachName,
      coachEmail: selectedCoach.coachEmail,
      coachPhone: selectedCoach.coachPhone,
      date,
      time: selectedBookingTime,
      durationHours,
      players: isFixedGroupCoaching ? 1 : players,
      location,
      courtOption: requiresCourtOption(location) ? courtOption : "",
      coachingFormat,
      coachingFee: price,
    }].sort((a, b) => a.date.localeCompare(b.date) || allTimeSlots.indexOf(a.time) - allTimeSlots.indexOf(b.time)));
    setStatus("Session added. Choose another date and time, then add it to the bundle.");
  }

  function removeBundleSession(clientId) {
    setBundleSessions((sessions) => sessions.filter((session) => session.clientId !== clientId));
    setStatus("");
  }

  function clearBundleSessions() {
    setBundleSessions([]);
    setStatus("");
  }

  async function submitBundleBooking() {
    if (submittingRef.current || bundleSessions.length === 0) return;
    if (!adminUser || !customerProfile?.profileCompleted) return setStatus("Please sign in and complete your profile first.");

    const expiresAt = Timestamp.fromMillis(Date.now() + 10 * 60 * 1000);
    const bundleId = doc(collection(db, "bookings")).id;
    const bundleReference = `ILHAM-BUNDLE-${Date.now().toString().slice(-8)}`;
    const records = bundleSessions.map((session, index) => {
      const bookingRef = doc(collection(db, "bookings"));
      const requestedSlots = getRequestedSlotKeys(session.date, session.time, session.durationHours);
      return { session, index, bookingRef, bookingId: bookingRef.id, requestedSlots };
    });
    const lockEntries = records.flatMap((record) => record.requestedSlots.map((slot) => ({
      record,
      slot,
      lockRef: doc(db, "availabilityLocks", getSlotLockId(record.session.coachId, record.session.date, slot)),
    })));
    if (new Set(lockEntries.map((entry) => entry.lockRef.id)).size !== lockEntries.length) return setStatus("Two sessions in this bundle overlap. Please remove one of them.");

    submittingRef.current = true;
    setLoading(true);
    setStatus("Reserving all bundle sessions...");

    try {
      await runTransaction(db, async (transaction) => {
        const lockSnapshots = [];
        for (const entry of lockEntries) lockSnapshots.push(await transaction.get(entry.lockRef));
        lockSnapshots.forEach((snapshot) => {
          const lock = snapshot.data();
          const lockExpiry = lock?.confirmationExpiresAt?.toMillis?.() || 0;
          if (lock && lock.status !== "expired" && (lock.status !== "pending_confirmation" || lockExpiry > Date.now())) {
            throw new Error("One of the bundle slots is no longer available. No sessions were reserved.");
          }
        });

        records.forEach(({ session, index, bookingRef, bookingId, requestedSlots }) => {
          const bookingData = {
            customerId: adminUser.uid,
            customerName: customerProfile.fullName,
            customerEmail: adminUser.email || customerProfile.email,
            customerPhone: customerProfile.phone,
            name: customerProfile.fullName,
            phone: customerProfile.phone,
            date: session.date,
            time: session.time,
            startTime: session.time,
            endTime: getEndTime(session.time, session.durationHours),
            players: session.players,
            duration: session.durationHours,
            durationHours: session.durationHours,
            location: session.location,
            courtOption: session.courtOption,
            court: session.courtOption,
            trainingArea: selectedArea,
            trainingAreaName: trainingAreas[selectedArea]?.name || "",
            coachingFee: session.coachingFee,
            paymentStatus: "Unpaid",
            bookingStatus: "Pending Confirmation",
            status: "pending_confirmation",
            confirmationExpiresAt: expiresAt,
            confirmationEmailSent: false,
            confirmationEmailStatus: "pending",
            adminNotificationEmailStatus: "pending",
            pdfGenerated: false,
            note,
            notes: note,
            type: "booking",
            serviceType: selectedService?.id || "",
            serviceName: selectedService?.title || "",
            coachingFormat: session.coachingFormat || coachingFormat,
            paymentType: "pay_per_session",
            createdBy: "",
            coachId: session.coachId,
            coachName: session.coachName,
            coachEmail: session.coachEmail,
            coachPhone: session.coachPhone,
            bundleId,
            bundleReference,
            bundleIndex: index + 1,
            bundleSize: records.length,
            role: "customer",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          transaction.set(bookingRef, bookingData);
          requestedSlots.forEach((slot) => transaction.set(doc(db, "availabilityLocks", getSlotLockId(session.coachId, session.date, slot)), {
            bookingId,
            bundleId,
            customerId: adminUser.uid,
            coachId: session.coachId,
            date: session.date,
            time: getAvailabilityLockTime({ date: session.date, time: slot }),
            status: "pending_confirmation",
            confirmationExpiresAt: expiresAt,
            updatedAt: serverTimestamp(),
          }));
        });

        const first = records[0];
        transaction.set(doc(db, "notifications", first.bookingId), {
          bookingId: first.bookingId,
          bundleId,
          bundleReference,
          sessionCount: records.length,
          customerId: adminUser.uid,
          coachId: first.session.coachId,
          title: "New bundle booking request",
          message: `${customerProfile.fullName} requested a bundle of ${records.length} sessions.`,
          name: customerProfile.fullName,
          phone: customerProfile.phone,
          email: adminUser.email || customerProfile.email || "",
          date: first.session.date,
          time: first.session.time,
          isRead: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      const bookingIds = records.map((record) => record.bookingId);
      try {
        const token = await adminUser.getIdToken();
        const response = await fetch("/api/send-admin-bundle-notification", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ bookingIds }),
        });
        const responseData = await response.json();
        if (!response.ok || !responseData.ok) throw new Error(responseData.error || "Bundle notification email could not be sent");
        await Promise.all(records.map((record) => updateDoc(record.bookingRef, { adminNotificationEmailStatus: "sent", adminNotificationEmailSentAt: serverTimestamp(), updatedAt: serverTimestamp() })));
      } catch (emailError) {
        console.error(emailError);
        await Promise.all(records.map((record) => updateDoc(record.bookingRef, { adminNotificationEmailStatus: "failed", updatedAt: serverTimestamp() }).catch(console.error)));
      }

      setBundleSessions([]);
      window.location.assign(`/booking/confirm/${records[0].bookingId}`);
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Bundle could not be reserved.");
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  async function submitBooking() {
    if (submittingRef.current) return;
    if (!adminUser || !customerProfile?.profileCompleted) {
      setStatus("Please sign in and complete your profile first.");
      return;
    }
    if (!date || !selectedBookingTime || !selectedCoach) {
      setStatus("Please select a date, time and coach.");
      return;
    }
    if (selectedArea === "kl" && isBeforeKualaLumpurStart(date)) {
      setStatus("Kuala Lumpur bookings begin from 1 October 2026.");
      return;
    }
    if (bookingCutoffApplies && isAfterCustomerBookingCutoff(date)) {
      setStatus("Coach Ilham bookings are closed after 18 September 2026.");
      return;
    }
    if (isFixedGroupCoaching && (parseBookingDate(date).getDay() !== 2 || selectedBookingTime !== "8:00 PM" || durationHours !== 2)) {
      setStatus("Group Coaching is only available every Tuesday from 8:00 PM to 10:00 PM.");
      return;
    }
    if (isFixedGroupCoaching && groupParticipants.length >= groupCoachingCapacity) {
      setStatus("This Group Coaching session is already full.");
      return;
    }
    if (isFixedGroupCoaching && bookings.some((booking) => booking.customerId === adminUser.uid && booking.date === date && isGroupCoachingBooking(booking) && isReservedBooking(booking))) {
      setStatus("You are already registered for this Group Coaching session.");
      return;
    }

    if (!isFixedGroupCoaching && requiresCourtOption(location) && !courtOption) {
      setStatus("Please choose Indoor Court or Outdoor Court.");
      return;
    }

    if (hasBookingOverlap(selectedCoachBookings, date, selectedBookingTime, durationHours)) {
      setStatus("That slot is no longer available. Please choose another time.");
      return;
    }


    const expiresAt = Timestamp.fromMillis(Date.now() + 10 * 60 * 1000);
    const bookingId = editBookingId || draftBookingId;
    const bookingRef = doc(db, "bookings", bookingId);
    const notificationRef = doc(db, "notifications", bookingId);
    const requestedSlots = getRequestedSlotKeys(date, selectedBookingTime, durationHours);
    const bookingData = {
      customerId: adminUser.uid,
      customerName: customerProfile.fullName,
      customerEmail: adminUser.email || customerProfile.email,
      customerPhone: customerProfile.phone,
      name: customerProfile.fullName,
      phone: customerProfile.phone,
      date,
      time: selectedBookingTime,
      startTime: selectedBookingTime,
      endTime: getEndTime(selectedBookingTime, durationHours),
      players,
      duration: durationHours,
      durationHours,
      location: isFixedGroupCoaching ? "Group Coaching Session" : location,
      courtOption: isFixedGroupCoaching ? "" : requiresCourtOption(location) ? courtOption : "",
      court: isFixedGroupCoaching ? "" : requiresCourtOption(location) ? courtOption : "",
      trainingArea: selectedArea,
      trainingAreaName: trainingAreas[selectedArea]?.name || "",
      coachingFee: price,
      paymentStatus: "Unpaid",
      bookingStatus: "Pending Confirmation",
      status: "pending_confirmation",
      confirmationExpiresAt: expiresAt,
      confirmationEmailSent: false,
      confirmationEmailStatus: "pending",
      adminNotificationEmailStatus: "pending",
      pdfGenerated: false,
      note,
      notes: note,
      type: "booking",
      serviceType: selectedService?.id || "",
      serviceName: selectedService?.title || "",
      coachingFormat,
      groupCapacity: isFixedGroupCoaching ? groupCoachingCapacity : null,
      ratePerPlayer: isFixedGroupCoaching ? groupCoachingFeePerPlayer : null,
      paymentType: "pay_per_session",
      createdBy: "",
      coachId: selectedCoach.coachId,
      coachName: selectedCoach.coachName,
      coachEmail: selectedCoach.coachEmail,
      coachPhone: selectedCoach.coachPhone,
      role: "customer",
      updatedAt: serverTimestamp(),
    };

    submittingRef.current = true;
    setLoading(true);
    setStatus("Reserving your slot...");

    try {
      await runTransaction(db, async (transaction) => {
        const existingSnapshot = editBookingId ? await transaction.get(bookingRef) : null;
        const existing = existingSnapshot?.exists() ? existingSnapshot.data() : null;
        if (existing && existing.customerId !== adminUser.uid) throw new Error("You cannot edit this booking.");
        if (existing && existing.status !== "pending_confirmation") throw new Error("Only a pending booking can be edited.");

        if (isFixedGroupCoaching) {
          const seatRefs = Array.from({ length: groupCoachingCapacity }, (_, index) =>
            doc(db, "availabilityLocks", getGroupSeatLockId(selectedCoach.coachId, date, index + 1))
          );
          const seatSnapshots = [];
          for (const seatRef of seatRefs) seatSnapshots.push(await transaction.get(seatRef));
          const now = Date.now();
          const existingSeatIndex = existing?.groupSeatNumber ? Number(existing.groupSeatNumber) - 1 : -1;
          const availableSeatIndex = existingSeatIndex >= 0
            ? existingSeatIndex
            : seatSnapshots.findIndex((seatSnapshot) => {
              if (!seatSnapshot.exists()) return true;
              const lock = seatSnapshot.data();
              const lockExpiry = lock.confirmationExpiresAt?.toMillis?.() || 0;
              return lock.status === "expired" || (lock.status === "pending_confirmation" && lockExpiry <= now);
            });
          if (availableSeatIndex < 0) throw new Error("This Group Coaching session is already full.");
          const seatNumber = availableSeatIndex + 1;
          const seatRef = seatRefs[availableSeatIndex];
          const currentSeatLock = seatSnapshots[availableSeatIndex]?.data();
          if (currentSeatLock && currentSeatLock.bookingId !== bookingId && currentSeatLock.status !== "expired" && !(currentSeatLock.status === "pending_confirmation" && (currentSeatLock.confirmationExpiresAt?.toMillis?.() || 0) <= now)) {
            throw new Error("This Group Coaching place was just taken. Please try again.");
          }

          transaction.set(bookingRef, { ...bookingData, groupSeatNumber: seatNumber, createdAt: existing?.createdAt || serverTimestamp() }, { merge: true });
          transaction.set(seatRef, {
            bookingId,
            customerId: adminUser.uid,
            customerName: customerProfile.fullName,
            coachId: selectedCoach.coachId,
            date,
            time: getAvailabilityLockTime({ date, time: "8:00 PM" }),
            duration: 2,
            coachingFormat: "group",
            serviceType: selectedService?.id || "group",
            groupSeatNumber: seatNumber,
            groupCapacity: groupCoachingCapacity,
            ratePerPlayer: groupCoachingFeePerPlayer,
            status: "pending_confirmation",
            confirmationExpiresAt: expiresAt,
            updatedAt: serverTimestamp(),
          });
          transaction.set(notificationRef, {
            bookingId,
            customerId: adminUser.uid,
            coachId: selectedCoach.coachId,
            title: "New group coaching registration",
            message: `${customerProfile.fullName} registered for Group Coaching on ${date}, 8:00 PM–10:00 PM.`,
            name: customerProfile.fullName,
            phone: customerProfile.phone,
            email: adminUser.email || customerProfile.email || "",
            date,
            time: "8:00 PM",
            duration: 2,
            location: "Group Coaching Session",
            courtOption: "",
            isRead: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }, { merge: true });
          return;
        }

        const oldSlots = existing ? getRequestedSlotKeys(existing.date, existing.startTime || existing.time, existing.durationHours || existing.duration) : [];
        const allKeys = [...new Set([...oldSlots, ...requestedSlots])];
        const lockRefs = allKeys.map((slot) => doc(db, "availabilityLocks", getSlotLockId(selectedCoach.coachId, date, slot)));
        const lockSnapshots = [];
        for (const lockRef of lockRefs) lockSnapshots.push(await transaction.get(lockRef));

        requestedSlots.forEach((slot) => {
          const lockId = getSlotLockId(selectedCoach.coachId, date, slot);
          const index = lockRefs.findIndex((ref) => ref.id === lockId);
          const lock = lockSnapshots[index]?.data();
          const lockExpiry = lock?.confirmationExpiresAt?.toMillis?.() || 0;
          if (lock && lock.bookingId !== bookingId && lock.status !== "expired" && (lock.status !== "pending_confirmation" || lockExpiry > Date.now())) {
            throw new Error("This slot is no longer available. Please select another time.");
          }
        });

        transaction.set(bookingRef, { ...bookingData, createdAt: existing?.createdAt || serverTimestamp() }, { merge: true });
        oldSlots.filter((slot) => !requestedSlots.includes(slot)).forEach((slot) => transaction.delete(doc(db, "availabilityLocks", getSlotLockId(existing.coachId, existing.date, slot))));
        requestedSlots.forEach((slot) => transaction.set(doc(db, "availabilityLocks", getSlotLockId(selectedCoach.coachId, date, slot)), {
          bookingId,
          customerId: adminUser.uid,
          coachId: selectedCoach.coachId,
          date,
          time: getAvailabilityLockTime({ date, time: slot }),
          status: "pending_confirmation",
          confirmationExpiresAt: expiresAt,
          updatedAt: serverTimestamp(),
        }));
        transaction.set(notificationRef, {
          bookingId,
          customerId: adminUser.uid,
          coachId: selectedCoach.coachId,
          title: existing ? "Booking request updated" : "New booking request",
          message: `${customerProfile.fullName} requested ${date} at ${selectedBookingTime}.`,
          name: customerProfile.fullName,
          phone: customerProfile.phone,
          email: adminUser.email || customerProfile.email || "",
          date,
          time: selectedBookingTime,
          duration: durationHours,
          location,
          courtOption: requiresCourtOption(location) ? courtOption : "",
          isRead: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      });

      try {
        const token = await adminUser.getIdToken();
        const response = await fetch("/api/send-admin-booking-notification", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ bookingId }),
        });
        const responseData = await response.json();
        if (!response.ok || !responseData.ok) throw new Error(responseData.error || "Admin notification email could not be sent");
        await updateDoc(bookingRef, { adminNotificationEmailStatus: "sent", adminNotificationEmailSentAt: serverTimestamp(), updatedAt: serverTimestamp() });
      } catch (emailError) {
        console.error(emailError);
        await updateDoc(bookingRef, { adminNotificationEmailStatus: "failed", updatedAt: serverTimestamp() }).catch(console.error);
      }

      window.location.assign(`/booking/confirm/${bookingId}`);
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Booking could not be reserved.");
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  async function confirmBooking(booking, whatsappWindow = null) {
    if (!adminUser || !booking || submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    setStatus("Checking availability and confirming...");
    let shouldSendEmail = false;
    let confirmedBooking = null;
    let reservationExpired = false;
    try {
      await runTransaction(db, async (transaction) => {
        const bookingRef = doc(db, "bookings", booking.id);
        const snapshot = await transaction.get(bookingRef);
        if (!snapshot.exists()) throw new Error("Booking not found.");
        const current = snapshot.data();
        if (current.customerId !== adminUser.uid) throw new Error("You do not have access to this booking.");
        if (current.status === "confirmed") {
          confirmedBooking = { id: booking.id, ...current };
          return;
        }
        if (current.status !== "pending_confirmation") throw new Error("This booking can no longer be confirmed.");
        const slots = getRequestedSlotKeys(current.date, current.startTime || current.time, current.durationHours || current.duration);
        const lockRefs = isGroupCoachingBooking(current) && current.groupSeatNumber
          ? [doc(db, "availabilityLocks", getGroupSeatLockId(current.coachId, current.date, current.groupSeatNumber))]
          : slots.map((slot) => doc(db, "availabilityLocks", getSlotLockId(current.coachId, current.date, slot)));
        const lockSnapshots = [];
        for (const lockRef of lockRefs) lockSnapshots.push(await transaction.get(lockRef));
        if ((current.confirmationExpiresAt?.toMillis?.() || 0) <= Date.now()) {
          transaction.update(bookingRef, { status: "expired", bookingStatus: "Expired", updatedAt: serverTimestamp() });
          lockRefs.forEach((lockRef, index) => { if (lockSnapshots[index].exists() && lockSnapshots[index].data().bookingId === booking.id) transaction.delete(lockRef); });
          reservationExpired = true;
          return;
        }
        if (lockSnapshots.some((lock) => !lock.exists() || lock.data().bookingId !== booking.id)) {
          throw new Error("This slot is no longer available. Please select another time.");
        }

        const bookingReference = current.bookingReference || getBookingReference(booking.id, current.date);
        const updates = {
          status: "confirmed",
          bookingStatus: "Confirmed",
          bookingReference,
          confirmedAt: serverTimestamp(),
          pdfGenerated: true,
          confirmationEmailStatus: current.confirmationEmailSent ? "sent" : "pending",
          updatedAt: serverTimestamp(),
        };
        transaction.update(bookingRef, updates);
        lockRefs.forEach((lockRef) => transaction.update(lockRef, { status: "confirmed", confirmationExpiresAt: null, updatedAt: serverTimestamp() }));
        shouldSendEmail = !current.confirmationEmailSent;
        confirmedBooking = { id: booking.id, ...current, ...updates };
      });

      if (reservationExpired) throw new Error("Your reservation has expired. Please select the slot again.");

      if (shouldSendEmail && confirmedBooking) {
        try {
          const token = await adminUser.getIdToken();
          const response = await fetch("/api/send-booking-confirmation", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ bookingId: booking.id }),
          });
          if (!response.ok) throw new Error("Email delivery failed");
          await updateDoc(doc(db, "bookings", booking.id), { confirmationEmailSent: true, confirmationEmailSentAt: serverTimestamp(), confirmationEmailStatus: "sent", updatedAt: serverTimestamp() });
        } catch (emailError) {
          console.error(emailError);
          await updateDoc(doc(db, "bookings", booking.id), { confirmationEmailStatus: "failed", updatedAt: serverTimestamp() });
        }
      }
      const whatsappUrl = confirmedBooking ? getWhatsAppBookingUrl(confirmedBooking.coachPhone, confirmedBooking) : "";
      if (whatsappWindow && whatsappUrl) whatsappWindow.location.href = whatsappUrl;
      else if (whatsappWindow) whatsappWindow.close();
      window.location.assign(`/booking/success/${booking.id}`);
    } catch (error) {
      if (whatsappWindow && !whatsappWindow.closed) whatsappWindow.close();
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Booking could not be confirmed.");
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  async function confirmBundleBookings(bundleBookings, whatsappWindow = null) {
    if (!adminUser || bundleBookings.length < 2 || submittingRef.current) return;
    const ordered = [...bundleBookings].sort((a, b) => Number(a.bundleIndex || 0) - Number(b.bundleIndex || 0));
    submittingRef.current = true;
    setLoading(true);
    setStatus("Checking and confirming all bundle sessions...");
    let confirmedBookings = [];
    let reservationExpired = false;

    try {
      await runTransaction(db, async (transaction) => {
        const bookingRefs = ordered.map((booking) => doc(db, "bookings", booking.id));
        const bookingSnapshots = [];
        for (const bookingRef of bookingRefs) bookingSnapshots.push(await transaction.get(bookingRef));
        if (bookingSnapshots.some((snapshot) => !snapshot.exists())) throw new Error("One or more bundle sessions could not be found.");

        const currents = bookingSnapshots.map((snapshot, index) => ({ id: ordered[index].id, ...snapshot.data() }));
        const bundleId = currents[0].bundleId;
        if (!bundleId || currents.some((current) => current.bundleId !== bundleId || current.customerId !== adminUser.uid)) throw new Error("You do not have access to this bundle.");
        if (currents.some((current) => !["pending_confirmation", "confirmed"].includes(current.status))) throw new Error("This bundle can no longer be confirmed.");

        const lockEntries = currents.flatMap((current, bookingIndex) => getRequestedSlotKeys(current.date, current.startTime || current.time, current.durationHours || current.duration).map((slot) => ({
          current,
          bookingIndex,
          lockRef: doc(db, "availabilityLocks", getSlotLockId(current.coachId, current.date, slot)),
        })));
        const lockSnapshots = [];
        for (const entry of lockEntries) lockSnapshots.push(await transaction.get(entry.lockRef));

        if (currents.some((current) => current.status === "pending_confirmation" && (current.confirmationExpiresAt?.toMillis?.() || 0) <= Date.now())) {
          currents.forEach((current, index) => {
            if (current.status === "pending_confirmation") transaction.update(bookingRefs[index], { status: "expired", bookingStatus: "Expired", updatedAt: serverTimestamp() });
          });
          lockEntries.forEach((entry, index) => {
            const lock = lockSnapshots[index];
            if (lock.exists() && lock.data().bookingId === entry.current.id && entry.current.status === "pending_confirmation") transaction.delete(entry.lockRef);
          });
          reservationExpired = true;
          return;
        }

        lockEntries.forEach((entry, index) => {
          const lock = lockSnapshots[index];
          if (!lock.exists() || lock.data().bookingId !== entry.current.id) throw new Error(`The slot on ${entry.current.date} at ${entry.current.time} is no longer available.`);
        });

        confirmedBookings = currents.map((current, index) => {
          if (current.status === "confirmed") return current;
          const updates = {
            status: "confirmed",
            bookingStatus: "Confirmed",
            bookingReference: current.bookingReference || getBookingReference(current.id, current.date),
            confirmedAt: serverTimestamp(),
            pdfGenerated: true,
            confirmationEmailStatus: current.confirmationEmailSent ? "sent" : "pending",
            updatedAt: serverTimestamp(),
          };
          transaction.update(bookingRefs[index], updates);
          return { ...current, ...updates };
        });
        lockEntries.forEach((entry) => transaction.update(entry.lockRef, { status: "confirmed", confirmationExpiresAt: null, updatedAt: serverTimestamp() }));
      });

      if (reservationExpired) throw new Error("Your bundle reservation has expired. Please select the sessions again.");

      try {
        const bookingIds = confirmedBookings.map((booking) => booking.id);
        const token = await adminUser.getIdToken();
        const response = await fetch("/api/send-bundle-confirmation", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ bookingIds }),
        });
        if (!response.ok) throw new Error("Bundle confirmation email delivery failed");
        await Promise.all(bookingIds.map((bookingId) => updateDoc(doc(db, "bookings", bookingId), { confirmationEmailSent: true, confirmationEmailSentAt: serverTimestamp(), confirmationEmailStatus: "sent", updatedAt: serverTimestamp() })));
      } catch (emailError) {
        console.error(emailError);
        await Promise.all(confirmedBookings.map((booking) => updateDoc(doc(db, "bookings", booking.id), { confirmationEmailStatus: "failed", updatedAt: serverTimestamp() }).catch(console.error)));
      }

      const whatsappUrl = getBundleWhatsAppUrl(confirmedBookings[0]?.coachPhone, confirmedBookings);
      if (whatsappWindow && whatsappUrl) whatsappWindow.location.href = whatsappUrl;
      else if (whatsappWindow) whatsappWindow.close();
      window.location.assign(`/booking/success/${confirmedBookings[0].id}`);
    } catch (error) {
      if (whatsappWindow && !whatsappWindow.closed) whatsappWindow.close();
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Bundle could not be confirmed.");
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  const monthDays = getMonthDays(calendarMonth);
  const monthLabel = calendarMonth.toLocaleString("default", { month: "long", year: "numeric" });

  function getDateStatus(day) {
    if (!day) return null;
    if (!selectedCoachId) return "Select coach";
    if (selectedArea === "kl" && isBeforeKualaLumpurStart(day)) return "Starts 1 Oct";
    if (bookingCutoffApplies && isAfterCustomerBookingCutoff(day)) return "Closed";
    if (isFixedGroupCoaching && day.getDay() !== 2) return "Unavailable";

    const dayString = formatDate(day);
    const dayRange = {
      start: parseBookingDate(dayString),
      end: parseBookingDate(dayString),
    };
    dayRange.end.setDate(dayRange.end.getDate() + 1);
    if (isFixedGroupCoaching) {
      const registeredCount = bookings.filter((booking) => {
        if (!booking.isSlotLock || !isGroupCoachingBooking(booking) || booking.date !== dayString) return false;
        return isReservedBooking(booking);
      }).length;
      return registeredCount >= groupCoachingCapacity
        ? "full"
        : `${groupCoachingCapacity - registeredCount} places left`;
    }

    const bookedCount = getExpandedReservedSlots(selectedCoachBookings, dayRange).length;

    if (bookedCount >= allTimeSlots.length) return "full";
    if (bookedCount > 0) return `${allTimeSlots.length - bookedCount} slots left`;
    return "Available";
  }

  if (isAdminPage) {
    return (
      <AdminDashboard
        bookings={bookings}
        packages={packages}
        customers={customers}
        notifications={notifications}
        coaches={coaches}
        transferLogs={transferLogs}
        users={users}
        leaveRequests={leaveRequests}
        onRefresh={refreshBookings}
        user={adminUser}
        userProfile={adminProfile}
        authLoading={authLoading}
      />
    );
  }

  if (isCustomerPage) {
    let page = null;
    const confirmationBooking = confirmationBookingId ? bookings.find((item) => item.id === confirmationBookingId) : null;
    const confirmationBundleBookings = confirmationBooking?.bundleId ? bookings.filter((item) => item.bundleId === confirmationBooking.bundleId) : [];
    const successBooking = successBookingId ? bookings.find((item) => item.id === successBookingId) : null;
    const successBundleBookings = successBooking?.bundleId ? bookings.filter((item) => item.bundleId === successBooking.bundleId) : [];
    if (isBookingPage) page = (
      <BookingPage
        selectedArea={selectedArea}
        selectedService={selectedService}
        coachingFormat={coachingFormat}
        setCoachingFormat={setCoachingFormat}
        editBookingId={editBookingId}
        customer={customerProfile}
        user={adminUser}
        selectedCoachId={selectedCoachId}
        setSelectedCoachId={setSelectedCoachId}
        publicCoachOptions={publicCoachOptions}
        date={date}
        setDate={setDate}
        selectedBookingTime={selectedBookingTime}
        setTime={setTime}
        availableSlots={availableSlots}
        reservedForSelectedDate={reservedForSelectedDate}
        location={location}
        setLocation={setLocation}
        courtOption={courtOption}
        setCourtOption={setCourtOption}
        players={players}
        setPlayers={setPlayers}
        duration={duration}
        setDuration={setDuration}
        note={note}
        setNote={setNote}
        submitBooking={submitBooking}
        addBundleSession={addBundleSession}
        removeBundleSession={removeBundleSession}
        clearBundleSessions={clearBundleSessions}
        submitBundleBooking={submitBundleBooking}
        bundleSessions={bundleSessions}
        loading={loading}
        status={status}
        calendarMonth={calendarMonth}
        setCalendarMonth={setCalendarMonth}
        monthLabel={monthLabel}
        monthDays={monthDays}
        getDateStatus={getDateStatus}
        selectedCoachBookings={selectedCoachBookings}
        groupParticipants={groupParticipants}
        bookingCutoffApplies={bookingCutoffApplies}
      />
    );
    if (confirmationBookingId) page = <ConfirmationPage booking={confirmationBooking} bundleBookings={confirmationBundleBookings} user={adminUser} profile={customerProfile} onConfirm={confirmBooking} onConfirmBundle={confirmBundleBookings} loading={loading} status={status} />;
    if (successBookingId) page = <SuccessPage booking={successBooking} bundleBookings={successBundleBookings} user={adminUser} profile={customerProfile} />;
    if (currentPath === "/my-bookings") page = <MyBookingsPage bookings={bookings} packages={packages} user={adminUser} profile={customerProfile} />;
    if (detailBookingId) page = <BookingDetailPage booking={bookings.find((item) => item.id === detailBookingId)} user={adminUser} profile={customerProfile} />;
    if (currentPath === "/my-profile") page = <ProfilePage user={adminUser} profile={customerProfile} />;
    return <CustomerAccess key={adminUser?.uid || "signed-out"} user={adminUser} profile={customerProfile} loading={authLoading}>{page}</CustomerAccess>;
  }

  return <HomePage area={pathArea} />;

  /* eslint-disable no-unreachable */
  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-neutral-950 text-white">
      <div className="w-full max-w-6xl mx-auto px-4 py-8 sm:px-5 sm:py-12">
        <div className="flex justify-end mb-6">
          <a
            href="/admin"
            className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:border-lime-400 hover:text-lime-300 transition"
          >
            Coach Login
          </a>
        </div>


        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10 items-center overflow-hidden">

          <div>
            <p className="inline-block rounded-full border border-lime-400/40 px-4 py-2 text-sm text-lime-300">
              ITF Coaching Level 1 &bull; Sport Science Level 1
            </p>

            <h1 className="mt-6 text-4xl md:text-6xl font-bold">
              Private Tennis Coach in Johor Bahru
            </h1>

            <p className="mt-5 text-neutral-300 text-lg">
              Coach Ilham Academy offers Tennis Lessons Johor Bahru for kids and adults, with private tennis coaching built around your level, your pace, and your goals.
            </p>

            <p className="mt-3 text-neutral-400">
              Tennis Coach Johor Bahru based at Nusa Duta Tennis Complex.
            </p>
          </div>

          <div className="flex justify-center">
            <img
              src={coachImage}
              alt="Coach Ilham"
              className="w-full max-w-sm sm:max-w-md rounded-3xl border border-neutral-800 object-cover shadow-2xl"
            />
          </div>

        </div>

        <section className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
            <h2 className="text-xl font-semibold">Tennis Lessons for Kids</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-400">
              Kids Tennis Lessons Johor Bahru focus on confidence, coordination, footwork, and clean stroke basics in a friendly private coaching environment.
            </p>
          </div>

          <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
            <h2 className="text-xl font-semibold">Adult Tennis Coaching</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-400">
              Adult Tennis Coaching Johor Bahru is available for new players, returning players, and adults who want focused Tennis Training Johor Bahru sessions.
            </p>
          </div>

          <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
            <h2 className="text-xl font-semibold">Beginner Tennis Classes</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-400">
              Tennis Classes Johor Bahru for beginners cover grips, rallying, serving, scoring, and match confidence at a pace that suits each student.
            </p>
          </div>

          <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
            <h2 className="text-xl font-semibold">Nusa Duta Tennis Complex Johor Bahru</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-400">
              Book a Private Tennis Coach Johor Bahru session at Nusa Duta Tennis Complex with real-time coach availability and weekly schedule viewing.
            </p>
          </div>
        </section>


        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-12 items-start">
          <div className="w-full max-w-full self-start bg-neutral-900 border border-neutral-800 rounded-3xl p-4 sm:p-6 md:p-8">
            <h2 className="text-2xl font-semibold mb-6">Booking Form</h2>

            <div className="space-y-4">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your Name" className="w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-lime-400" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone Number" className="w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-lime-400" />
              <select
                value={selectedCoachId}
                onChange={(e) => setSelectedCoachId(e.target.value)}
                className="w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-lime-400"
              >
                <option value="">Select Coach</option>
                {publicCoachOptions.map((coach) => (
                  <option key={coach.coachId} value={coach.coachId}>
                    {coach.coachName}
                  </option>
                ))}
              </select>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-lime-400" />

              <select value={selectedBookingTime} onChange={(e) => setTime(e.target.value)} disabled={!selectedCoachId || availableSlots.length === 0} className="w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-lime-400">
                {!selectedCoachId ? <option>Please select coach first</option> : availableSlots.length === 0 ? <option>No available slots</option> : availableSlots.map((slot) => <option key={slot}>{slot}</option>)}
              </select>

              {reservedForSelectedDate.length > 0 && (
                <p className="text-sm text-neutral-400">
                  Unavailable: {[...new Set(reservedForSelectedDate.map((slot) => slot.time))].join(", ")}
                </p>
              )}

              <select value={location} onChange={(e) => setLocation(e.target.value)} className="w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-lime-400">
                <option>Tennis Nusa Duta</option>
                <option>Client Preferred Location</option>
              </select>

              <div className="grid grid-cols-2 gap-4">
                <select value={players} onChange={(e) => setPlayers(Number(e.target.value))} className="rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-lime-400">
                  <option value={1}>1 Player</option>
                  <option value={2}>2 Players</option>
                  <option value={3}>3 Players</option>
                  <option value={4}>4 Players</option>
                </select>
                <div className="relative">
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    onBlur={() => {
                      if (!duration || Number(duration) < 1) {
                        setDuration("1");
                      }
                    }}
                    placeholder="1 hour"
                    className="w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 pr-20 outline-none focus:border-lime-400"
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-neutral-400">
                    hours
                  </span>
                </div>
              </div>

              <textarea rows="4" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notes" className="w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-lime-400" />


              <button onClick={submitBooking} disabled={loading || !selectedCoachId || availableSlots.length === 0} className="w-full bg-white text-black rounded-2xl py-4 font-semibold hover:bg-neutral-200 transition disabled:opacity-50">
                {loading ? "Please wait..." : "Book Now"}
              </button>

              {status && <p className="text-sm text-neutral-300">{status}</p>}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 md:p-8">
              <div className="flex items-center justify-between gap-3 mb-6">
                <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} className="rounded-xl border border-neutral-700 px-3 py-2">&larr;</button>
                <h2 className="text-2xl font-semibold text-center">{monthLabel}</h2>
                <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} className="rounded-xl border border-neutral-700 px-3 py-2">&rarr;</button>
              </div>

              <div className="grid grid-cols-7 gap-2 text-center text-xs text-neutral-400 mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div key={day}>{day}</div>)}
              </div>

              <div className="grid grid-cols-7 gap-2">
                {monthDays.map((day, index) => {
                  const dayString = day ? formatDate(day) : "";
                  const dayStatus = getDateStatus(day);
                  const isFullDay = dayStatus === "full";
                  const isSelected = dayString === date;
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);

                  const isPast = day && day < today;

                  return (
                    <button
                      key={index}
                      disabled={!day || isPast}
                      onClick={() => day && setDate(dayString)}
                      className={`min-h-20 rounded-2xl border p-2 text-left transition ${isPast
                          ? "opacity-30 cursor-not-allowed border-neutral-900 bg-neutral-950"
                          : isSelected
                            ? "border-lime-400 bg-lime-400 text-black"
                            : "border-neutral-800 bg-neutral-950 hover:border-neutral-600"
                        } ${!day ? "opacity-0" : ""}`}
                    >
                      {day && (
                        <>
                          <div className={`font-semibold ${isFullDay ? "line-through decoration-2" : ""}`}>{day.getDate()}</div>
                          {!isFullDay && (
                            <div className={`mt-2 text-[10px] ${isSelected ? "text-black" : "text-lime-300"}`}>
                              {dayStatus}
                            </div>
                          )}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <WeeklySchedule
              bookings={selectedCoachBookings}
              selectedDate={date}
              onSelectDate={setDate}
              className="min-h-[600px] flex flex-col"
              contentClassName="min-h-[520px] flex-1"
              hideBookingNames
            />



            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 md:p-8">
              <h2 className="text-2xl font-semibold mb-5">Court Rental</h2>
              <div className="grid sm:grid-cols-2 gap-4 text-neutral-300">
                <div className="rounded-2xl bg-neutral-800 p-4"><div className="font-semibold text-white">Day Session</div><div>8AM - 7PM</div><div>Outdoor RM10/hour</div><div>Indoor RM15/hour</div></div>
                <div className="rounded-2xl bg-neutral-800 p-4"><div className="font-semibold text-white">Night Session</div><div>7PM - 12AM</div><div>Outdoor RM20/hour</div><div>Indoor RM30/hour</div></div>
              </div>
              <a href="https://booking.stadiumjohor.my/product-tag/tennis/" target="_blank" className="inline-block mt-6 text-lime-400 hover:text-lime-300">Book Court at Stadium Johor &rarr;</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  /* eslint-enable no-unreachable */
}













