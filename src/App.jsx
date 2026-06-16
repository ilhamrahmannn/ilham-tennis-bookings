import coachImage from "./assets/ilham.jpg";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "./firebase";

const roles = {
  SUPER_ADMIN: "super_admin",
  COACH: "coach",
  VIEWER: "viewer",
};



const rates = {
  1: { 1: 120, 2: 240 },
  2: { 1: 150, 2: 300 },
};

const allTimeSlots = [
  "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM",
  "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM",
  "6:00 PM", "7:00 PM", "8:00 PM", "9:00 PM", "10:00 PM",
  "11:00 PM",
];

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

const revenuePerHour = 100;
const unavailableTextPattern =
  /\b(n\/a|blocked?|emergency|not available|unavailable|manual block)\b/i;
const noteNaPattern = /(^|[^a-z0-9])n\s*\/?\s*a([^a-z0-9]|$)/i;

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
  return String(booking.bookingStatus || "").trim() === "Confirmed";
}

function getBookingDuration(booking) {
  const duration = Number(booking.duration || 1);
  return Number.isFinite(duration) && duration > 0 ? duration : 1;
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
    const startIndex = allTimeSlots.indexOf(String(booking.time || "").trim());
    if (startIndex === -1) return;

    const duration = getBookingDuration(booking);

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

  return Array.from({ length: getBookingDuration({ duration }) }, (_, index) => {
    const slot = allTimeSlots[startIndex + index];
    return slot ? `${date}-${slot}` : null;
  }).filter(Boolean);
}

function hasBookingOverlap(bookings, date, time, duration) {
  const requestedSlotKeys = getRequestedSlotKeys(date, time, duration);
  if (requestedSlotKeys.length !== getBookingDuration({ duration })) return true;

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
  const validBookingIndexes = new Set(
    validSlots.map((slot) => slot.bookingIndex)
  );

  return {
    totalBookings: validBookingIndexes.size,
    totalHours: validSlots.length,
    estimatedRevenue: validSlots.length * revenuePerHour,
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
  return booking.name || booking.note || "Booked";
}

function getUserRole(userProfile) {
  return userProfile?.role || roles.VIEWER;
}

function getCoachName(user, userProfile) {
  return userProfile?.coachName || user?.displayName || user?.email || "Coach";
}

function getCoachEmail(user, userProfile) {
  return userProfile?.coachEmail || user?.email || "";
}

function canEditAdminData(userProfile) {
  return [roles.SUPER_ADMIN, roles.COACH].includes(getUserRole(userProfile));
}

function canViewBookingForAdmin(booking, user, userProfile, selectedCoach) {
  const role = getUserRole(userProfile);

  if (role === roles.SUPER_ADMIN) {
    return selectedCoach === "all" || booking.createdBy === selectedCoach;
  }

  return Boolean(user?.uid) && booking.createdBy === user.uid;
}

function getBookingCoachLabel(booking) {
  return booking.coachName || booking.coachEmail || "Unknown coach";
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
      coachName: "ILHAM",
      coachEmail: email,
    };
  }

  if (email === "zayn@ilham-booking.local") {
    return {
      role: roles.COACH,
      coachName: "zayn",
      coachEmail: email,
    };
  }

  if (email === "khalis@ilham-booking.local") {
    return {
      role: roles.COACH,
      coachName: "khalis",
      coachEmail: email,
    };
  }

  return {
    role: roles.VIEWER,
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
  onSaveCell,
}) {
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [savingCellKey, setSavingCellKey] = useState("");

  const { weekDays, slotBookingsByKey } = useMemo(() => {
    const weekRange = getPeriodRange("week", selectedDate);
    const expandedSlots = editable
      ? getExpandedReservedSlots(bookings, weekRange)
      : getExpandedValidBookingSlots(bookings, weekRange);
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
  }, [bookings, selectedDate, editable]);

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
      <h2 className="text-2xl font-semibold mb-6">Weekly Schedule</h2>

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
                const cellText = getScheduleCellText(booking);
                const cellClassName = `relative min-h-14 p-3 text-left text-sm border-r border-neutral-800 transition ${shouldDimPast
                  ? "opacity-30 cursor-not-allowed text-neutral-600 bg-neutral-950"
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
                      <span>{isSaving ? "Saving..." : cellText}</span>
                      {booking && (
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
                  >
                    {shouldDimPast ? "" : cellText}
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

function AdminDashboard({ bookings, onRefresh, user, userProfile, authLoading }) {
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginStatus, setLoginStatus] = useState("");
  const [selectedCoach, setSelectedCoach] = useState("all");

  const [blockStartDate, setBlockStartDate] = useState(formatDate(new Date()));
  const [blockEndDate, setBlockEndDate] = useState(formatDate(new Date()));
  const [blockStartTime, setBlockStartTime] = useState("8:00 AM");
  const [blockEndTime, setBlockEndTime] = useState("9:00 AM");
  const [blockNote, setBlockNote] = useState("NA");
  const [blockStatus, setBlockStatus] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
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
  const coachOptions = useMemo(() => {
    const coaches = new Map();

    bookings.forEach((booking) => {
      if (!booking.createdBy) return;
      coaches.set(booking.createdBy, getBookingCoachLabel(booking));
    });

    return Array.from(coaches.entries()).map(([uid, label]) => ({ uid, label }));
  }, [bookings]);

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


  const sortedBookings = [...visibleBookings].reverse();
  const totalPages = Math.ceil(sortedBookings.length / rowsPerPage);
  const paginatedBookings = sortedBookings.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  async function saveWeeklyScheduleCell({ date, time, booking, value }) {
    if (!canEdit) {
      alert("Your account is read-only.");
      return;
    }

    if (
      userRole !== roles.SUPER_ADMIN &&
      booking?.createdBy &&
      booking.createdBy !== user?.uid
    ) {
      alert("You can only edit your own bookings.");
      return;
    }

    const text = String(value || "").trim();

    if (booking?.id && !text) {
      await deleteDoc(doc(db, "bookings", booking.id));
      return;
    }

    if (!text) return;
    if (!booking?.id && hasBookingOverlap(bookings, date, time, 1)) {
      alert("That slot is already reserved.");
      return;
    }

    const isBlocked = containsUnavailableText(text);
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
      createdBy: booking?.createdBy || user?.uid || "",
      coachName: booking?.coachName || getCoachName(user, userProfile),
      coachEmail: booking?.coachEmail || getCoachEmail(user, userProfile),
      role: userRole,
      updatedAt: serverTimestamp(),
    };

    if (booking?.id) {
      await updateDoc(doc(db, "bookings", booking.id), scheduleData);
      return;
    }

    await addDoc(collection(db, "bookings"), {
      ...scheduleData,
      createdAt: serverTimestamp(),
    });
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

      for (
        let current = new Date(startDate);
        current <= endDate;
        current.setDate(current.getDate() + 1)
      ) {
        const currentDate = formatDate(current);

        for (let i = startIndex; i <= endIndex; i++) {
          const selectedTime = allTimeSlots[i];

          if (!selectedTime) continue;
          if (hasBookingOverlap(bookings, currentDate, selectedTime, 1)) continue;

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
            note: blockNote || "NA",
            type: "blocked",
            createdBy: user?.uid || "",
            coachName: getCoachName(user, userProfile),
            coachEmail: getCoachEmail(user, userProfile),
            role: userRole,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }

      setBlockStatus("Manual block saved.");
      onRefresh();

    } catch (error) {
      console.error(error);
      setBlockStatus("Failed to save manual block.");
    }
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

  async function logoutAdmin() {
    await signOut(auth);
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center px-5">
        <p className="text-neutral-300">Checking admin access...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center px-5">
        <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-8">
          <h1 className="text-3xl font-bold">Coach Admin Login</h1>
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

          {loginStatus && (
            <p className="mt-3 text-sm text-neutral-300">{loginStatus}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white px-5 py-10">
      <div className="max-w-6xl mx-auto">

        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold">Admin Dashboard</h1>
            <p className="mt-2 text-neutral-400">
              {getCoachName(user, userProfile)} · {userRole}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {isSuperAdmin && (
              <select
                value={selectedCoach}
                onChange={(e) => {
                  setSelectedCoach(e.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-2xl bg-neutral-900 border border-neutral-700 px-4 py-3 text-sm"
              >
                <option value="all">All coaches</option>
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

        <div className="mt-8 grid md:grid-cols-3 gap-4">
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

        {canEdit ? (
          <div className="mt-8 bg-neutral-900 border border-neutral-800 rounded-3xl p-6">
            <h2 className="text-2xl font-semibold">Manual Block Slot</h2>
            <p className="mt-2 text-neutral-400">
              Block slots by date range and time range.
            </p>

            <div className="mt-5 grid md:grid-cols-5 gap-4">
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

        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={() => {
              const d = new Date(adminWeekDate);
              d.setDate(d.getDate() - 7);
              setAdminWeekDate(formatDate(d));
            }}
            className="rounded-2xl bg-neutral-800 px-5 py-3"
          >
            ← Previous Week
          </button>

          <button
            onClick={() => {
              const d = new Date(adminWeekDate);
              d.setDate(d.getDate() + 7);
              setAdminWeekDate(formatDate(d));
            }}
            className="rounded-2xl bg-neutral-800 px-5 py-3"
          >
            Next Week →
          </button>
        </div>

        <WeeklySchedule
          bookings={visibleBookings}
          selectedDate={adminWeekDate}
          onSelectDate={setAdminWeekDate}
          editable={canEdit}
          onSaveCell={saveWeeklyScheduleCell}
        />

        <div className="mt-8 overflow-x-auto overflow-y-auto max-h-[600px] rounded-3xl border border-neutral-800">
          <table className="w-full min-w-[1000px] bg-neutral-900 text-sm">
            <thead className="bg-neutral-800 text-neutral-300">
              <tr>
                <th className="p-4 text-left">Date</th>
                <th className="p-4 text-left">Time</th>
                <th className="p-4 text-left">Name</th>
                <th className="p-4 text-left">Phone</th>
                <th className="p-4 text-left">Players</th>
                <th className="p-4 text-left">Duration</th>
                <th className="p-4 text-left">Location</th>
                <th className="p-4 text-left">Payment</th>
                <th className="p-4 text-left">Status</th>
                <th className="p-4 text-left">Note</th>
              </tr>
            </thead>

            <tbody>
              {paginatedBookings.map((booking, index) => (
                <tr key={index} className="border-t border-neutral-800">
                  <td className="p-4">{booking.date}</td>
                  <td className="p-4">{booking.time}</td>
                  <td className="p-4 font-semibold text-lime-300">
                    {booking.name}
                  </td>
                  <td className="p-4">{booking.phone}</td>
                  <td className="p-4">{booking.players}</td>
                  <td className="p-4">{booking.duration}</td>
                  <td className="p-4">{booking.location}</td>
                  <td className="p-4">{booking.paymentStatus}</td>
                  <td className="p-4">{booking.bookingStatus}</td>
                  <td className="p-4">{booking.note}</td>
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
          ← Back to booking page
        </a>

      </div>
    </div>
  );
}

export default function App() {
  const isAdminPage = window.location.pathname === "/admin";
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [players, setPlayers] = useState(1);
  const [duration, setDuration] = useState(1);
  const [date, setDate] = useState(formatDate(new Date()));
  const [time, setTime] = useState("8:00 AM");
  const [location, setLocation] = useState("Tennis Nusa Duta");
  const [note, setNote] = useState("");
  const [bookings, setBookings] = useState([]);
  const [adminUser, setAdminUser] = useState(null);
  const [adminProfile, setAdminProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const price = useMemo(() => rates[players][duration], [players, duration]);

  const reservedForSelectedDate = useMemo(() => {
    const dayRange = {
      start: parseBookingDate(date),
      end: parseBookingDate(date),
    };
    dayRange.end.setDate(dayRange.end.getDate() + 1);

    return getExpandedReservedSlots(bookings, dayRange);
  }, [bookings, date]);

  const availableSlots = useMemo(() => {
    return allTimeSlots.filter(
      (slot) =>
        !isPastTimeSlot(date, slot) &&
        !hasBookingOverlap(bookings, date, slot, duration)
    );
  }, [bookings, date, duration]);
  const selectedBookingTime = availableSlots.includes(time) ? time : availableSlots[0] || "";

  function refreshBookings() {
    setStatus("Bookings update automatically from Firebase.");
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setAdminUser(nextUser);

      if (!nextUser) {
        setAdminProfile(null);
        setAuthLoading(false);
        return;
      }

      try {
        const defaultProfile = getDefaultAdminProfile(nextUser);
        const userSnapshot = await getDoc(doc(db, "users", nextUser.uid));
        const profile = userSnapshot.exists() ? userSnapshot.data() : {};

        setAdminProfile({
          role: profile.role || defaultProfile.role,
          coachName: profile.coachName || defaultProfile.coachName,
          coachEmail: profile.coachEmail || defaultProfile.coachEmail,
        });
      } catch (error) {
        console.error(error);
        setAdminProfile(getDefaultAdminProfile(nextUser));
      } finally {
        setAuthLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "bookings"),
      (snapshot) => {
        const nextBookings = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        nextBookings.sort((a, b) => {
          const dateCompare = String(a.date || "").localeCompare(String(b.date || ""));
          if (dateCompare !== 0) return dateCompare;
          return allTimeSlots.indexOf(a.time) - allTimeSlots.indexOf(b.time);
        });

        setBookings(nextBookings);
        setStatus("");
      },
      (error) => {
        console.error(error);
        setStatus("Could not load Firebase bookings. Please check Firebase config and Firestore rules.");
      }
    );

    return unsubscribe;
  }, []);

  async function submitBooking() {
    if (!name || !phone || !date || !selectedBookingTime) {
      setStatus("Please fill in name, phone, date and time.");
      return;
    }

    if (hasBookingOverlap(bookings, date, selectedBookingTime, duration)) {
      setStatus("That slot is no longer available. Please choose another time.");
      return;
    }

    const bookingData = {
      name,
      phone,
      date,
      time: selectedBookingTime,
      players,
      duration,
      location,
      coachingFee: price,
      paymentStatus: "Unpaid",
      bookingStatus: "Confirmed",
      note,
      type: "booking",
      createdBy: "",
      coachName: "Coach Ilham",
      coachEmail: "",
      role: "public",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    setLoading(true);
    setStatus("Saving booking...");

    try {
      await addDoc(collection(db, "bookings"), bookingData);

      const whatsappMessage = encodeURIComponent(
        `Hi Coach Ilham, I want to book a tennis coaching slot.

` +
        `Name: ${name}
` +
        `Phone: ${phone}
` +
        `Date: ${date}
` +
        `Time: ${selectedBookingTime}
` +
        `Players: ${players}
` +
        `Duration: ${duration} hour(s)
` +
        `Location: ${location}
` +
        `Coaching Fee: RM${price}
` +
        `Payment Status: Unpaid
` +
        `Booking Status: Pending

` +
        `Note: ${note || "-"}`
      );

      setStatus("Booking saved. Opening WhatsApp...");
      window.open(`https://wa.me/601137507963?text=${whatsappMessage}`, "_blank");

      setName("");
      setPhone("");
      setNote("");
    } catch (error) {
      console.error(error);
      setStatus("Booking failed. Please WhatsApp Coach Ilham directly.");
    } finally {
      setLoading(false);
    }
  }

  const monthDays = getMonthDays(calendarMonth);
  const monthLabel = calendarMonth.toLocaleString("default", { month: "long", year: "numeric" });

  function getDateStatus(day) {
    if (!day) return null;
    const dayString = formatDate(day);
    const dayRange = {
      start: parseBookingDate(dayString),
      end: parseBookingDate(dayString),
    };
    dayRange.end.setDate(dayRange.end.getDate() + 1);
    const bookedCount = getExpandedReservedSlots(bookings, dayRange).length;

    if (bookedCount >= allTimeSlots.length) return "Full";
    if (bookedCount > 0) return `${allTimeSlots.length - bookedCount} slots left`;
    return "Available";
  }

  if (isAdminPage) {
    return (
      <AdminDashboard
        bookings={bookings}
        onRefresh={refreshBookings}
        user={adminUser}
        userProfile={adminProfile}
        authLoading={authLoading}
      />
    );
  }

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-neutral-950 text-white">
      <div className="w-full max-w-6xl mx-auto px-4 py-8 sm:px-5 sm:py-12">
        <div className="flex justify-end mb-6">
          <a
            href="/admin"
            className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:border-lime-400 hover:text-lime-300 transition"
          >
            Admin Login
          </a>
        </div>


        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10 items-center overflow-hidden">

          <div>
            <p className="inline-block rounded-full border border-lime-400/40 px-4 py-2 text-sm text-lime-300">
              ITF Coaching Level 1 • Sport Science Level 1
            </p>

            <h1 className="mt-6 text-4xl md:text-6xl font-bold">
              Train With Coach Ilham
            </h1>

            <p className="mt-5 text-neutral-300 text-lg">
              Private tennis coaching built around your level, your pace, and your goals.
            </p>

            <p className="mt-3 text-neutral-400">
              Based at Nusa Duta Tennis Complex
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


        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-12 items-start">
          <div className="w-full max-w-full self-start bg-neutral-900 border border-neutral-800 rounded-3xl p-4 sm:p-6 md:p-8">
            <h2 className="text-2xl font-semibold mb-6">Booking Form</h2>

            <div className="space-y-4">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your Name" className="w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-lime-400" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone Number" className="w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-lime-400" />
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-lime-400" />

              <select value={selectedBookingTime} onChange={(e) => setTime(e.target.value)} disabled={availableSlots.length === 0} className="w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-lime-400">
                {availableSlots.length === 0 ? <option>No available slots</option> : availableSlots.map((slot) => <option key={slot}>{slot}</option>)}
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
                </select>
                <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-lime-400">
                  <option value={1}>1 Hour</option>
                  <option value={2}>2 Hours</option>
                </select>
              </div>

              <textarea rows="4" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notes" className="w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-lime-400" />



              <button onClick={submitBooking} disabled={loading || availableSlots.length === 0} className="w-full bg-white text-black rounded-2xl py-4 font-semibold hover:bg-neutral-200 transition disabled:opacity-50">
                {loading ? "Please wait..." : "Book Now"}
              </button>

              {status && <p className="text-sm text-neutral-300">{status}</p>}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 md:p-8">
              <div className="flex items-center justify-between gap-3 mb-6">
                <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} className="rounded-xl border border-neutral-700 px-3 py-2">←</button>
                <h2 className="text-2xl font-semibold text-center">{monthLabel}</h2>
                <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} className="rounded-xl border border-neutral-700 px-3 py-2">→</button>
              </div>

              <div className="grid grid-cols-7 gap-2 text-center text-xs text-neutral-400 mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div key={day}>{day}</div>)}
              </div>

              <div className="grid grid-cols-7 gap-2">
                {monthDays.map((day, index) => {
                  const dayString = day ? formatDate(day) : "";
                  const dayStatus = getDateStatus(day);
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
                          <div className="font-semibold">{day.getDate()}</div>
                          <div className={`mt-2 text-[10px] ${isSelected ? "text-black" : dayStatus === "Full" ? "text-red-400" : "text-lime-300"}`}>
                            {dayStatus}
                          </div>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <WeeklySchedule
              bookings={bookings}
              selectedDate={date}
              onSelectDate={setDate}
              className="min-h-[600px] flex flex-col"
              contentClassName="min-h-[520px] flex-1"
            />



            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 md:p-8">
              <h2 className="text-2xl font-semibold mb-5">Court Rental</h2>
              <div className="grid sm:grid-cols-2 gap-4 text-neutral-300">
                <div className="rounded-2xl bg-neutral-800 p-4"><div className="font-semibold text-white">Day Session</div><div>8AM - 7PM</div><div>Outdoor RM10/hour</div><div>Indoor RM15/hour</div></div>
                <div className="rounded-2xl bg-neutral-800 p-4"><div className="font-semibold text-white">Night Session</div><div>7PM - 12AM</div><div>Outdoor RM20/hour</div><div>Indoor RM30/hour</div></div>
              </div>
              <a href="https://booking.stadiumjohor.my/product-tag/tennis/" target="_blank" className="inline-block mt-6 text-lime-400 hover:text-lime-300">Book Court at Stadium Johor →</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
