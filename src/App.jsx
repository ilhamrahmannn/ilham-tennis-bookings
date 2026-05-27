import coachImage from "./assets/ilham.jpg";
import { useEffect, useMemo, useState } from "react";




const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzGYhVxmTWBevznTwPJhPybl-mXjnkUn0pBHQSIgHhtYcNnIEYAjfFMxgR2C-MM0NVaZQ/exec";



const ADMIN_PASSWORD = "coachilham123";



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
function WeeklySchedule({ bookings, selectedDate, onSelectDate }) {
  const start = new Date(selectedDate);
  const day = start.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + mondayOffset);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });

  function getBooking(date, time) {
    const dateString = formatDate(date);

    return bookings.find(
      (booking) =>
        booking.date === dateString &&
        (() => {
  const startIndex = allTimeSlots.indexOf(booking.time);
  const currentIndex = allTimeSlots.indexOf(time);
  const duration = Number(booking.duration || 1);

  return (
    currentIndex >= startIndex &&
    currentIndex < startIndex + duration
  );
})() &&
        ["Pending", "Confirmed"].includes(booking.bookingStatus)
    );
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 md:p-8 mt-8">
      <h2 className="text-2xl font-semibold mb-6">Weekly Schedule</h2>

      <div className="overflow-x-auto">
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
              className={`grid grid-cols-8 border-b border-neutral-800 ${
                index % 2 === 0 ? "bg-neutral-950" : "bg-neutral-900"
              }`}
            >
              <div className="p-3 text-sm text-neutral-300 border-r border-neutral-800">
                {slot}
              </div>

              {weekDays.map((day) => {
                const booking = getBooking(day, slot);

                return (
                  <button
                    key={`${formatDate(day)}-${slot}`}
                    onClick={() => {
                      onSelectDate(formatDate(day));
                    }}
                    className={`min-h-14 p-3 text-left text-sm border-r border-neutral-800 transition ${
                      booking
                        ? "text-black bg-lime-400 font-semibold"
                        : "text-neutral-500 hover:bg-neutral-800"
                    }`}
                  >
                    {booking ? booking.name || booking.note || "Booked" : ""}
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

function AdminDashboard({ bookings, onRefresh }) {
  const [password, setPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);

const [blockStartDate, setBlockStartDate] = useState(formatDate(new Date()));
const [blockEndDate, setBlockEndDate] = useState(formatDate(new Date()));
const [blockStartTime, setBlockStartTime] = useState("8:00 AM");
const [blockEndTime, setBlockEndTime] = useState("9:00 AM");
const [blockNote, setBlockNote] = useState("NA");
const [blockStatus, setBlockStatus] = useState("");

async function submitManualBlock() {
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

        await fetch(GOOGLE_SCRIPT_URL, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "addManualBlock",
            date: currentDate,
            time: selectedTime,
            note: blockNote || "Manual Block",
          }),
        });
      }
    }

    setBlockStatus("Manual block saved.");
    setTimeout(onRefresh, 1000);

  } catch (error) {
    console.error(error);
    setBlockStatus("Failed to save manual block.");
  }
}

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center px-5">
        <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-8">
          <h1 className="text-3xl font-bold">Coach Admin Login</h1>
          <p className="mt-2 text-neutral-400">Enter admin password to view bookings.</p>

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            className="mt-6 w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-lime-400"
          />

          <button
            onClick={() => {
              if (password === ADMIN_PASSWORD) {
                setIsLoggedIn(true);
              } else {
                alert("Wrong password");
              }
            }}
            className="mt-4 w-full bg-lime-400 text-black rounded-2xl py-4 font-semibold"
          >
            Login
          </button>
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
            Manage Coach Ilham booking requests.
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="rounded-2xl bg-white text-black px-5 py-3 font-semibold"
        >
          Refresh
        </button>
      </div>

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

      <WeeklySchedule
        bookings={bookings}
        selectedDate={formatDate(new Date())}
        onSelectDate={() => {}}
      />

      <div className="mt-8 overflow-x-auto rounded-3xl border border-neutral-800">
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
            {bookings.map((booking, index) => (
              <tr key={index} className="border-t border-neutral-800">
                <td className="p-4">{booking.date}</td>
                <td className="p-4">{booking.time}</td>
                <td className="p-4 font-semibold text-lime-300">{booking.name}</td>
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
  const [availableSlots, setAvailableSlots] = useState(allTimeSlots);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const price = useMemo(() => rates[players][duration], [players, duration]);

  const bookedForSelectedDate = useMemo(() => {
    return bookings.filter(
      (booking) =>
        String(booking.date).slice(0,10) === date &&
        ["Pending", "Confirmed"].includes(booking.bookingStatus)
    );
  }, [bookings, date]);

  useEffect(() => {
    const bookedTimes = [];

bookedForSelectedDate.forEach((booking) => {
  const startIndex = allTimeSlots.indexOf(booking.time);
  const duration = Number(booking.duration || 1);

  for (let i = 0; i < duration; i++) {
    if (allTimeSlots[startIndex + i]) {
      bookedTimes.push(allTimeSlots[startIndex + i]);
    }
  }
});
    const nextAvailableSlots = allTimeSlots.filter((slot) => !bookedTimes.includes(slot));
    setAvailableSlots(nextAvailableSlots);

    if (!nextAvailableSlots.includes(time)) {
      setTime(nextAvailableSlots[0] || "");
    }
  }, [bookedForSelectedDate, time]);

  async function loadBookings() {
    setLoading(true);
    setStatus("Checking latest slots...");

    try {
      const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=getBookings`);
      const data = await response.json();
      setBookings(data.bookings || []);
      setStatus("");
    } catch (error) {
      console.error(error);
      setStatus("Could not load Google Sheet bookings. Please check Apps Script deployment.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBookings();
  }, []);

  async function submitBooking() {
    if (!name || !phone || !date || !time) {
      setStatus("Please fill in name, phone, date and time.");
      return;
    }

    const bookingData = {
      name,
      phone,
      date,
      time,
      players,
      duration,
      location,
      coachingFee: price,
      paymentStatus: "Unpaid",
      bookingStatus: "Pending",
      note,
    };

    setLoading(true);
    setStatus("Saving booking...");

    try {
      await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookingData),
      });

      const whatsappMessage = encodeURIComponent(
        `Hi Coach Ilham, I want to book a tennis coaching slot.

` +
          `Name: ${name}
` +
          `Phone: ${phone}
` +
          `Date: ${date}
` +
          `Time: ${time}
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

      setTimeout(loadBookings, 1500);
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
    const bookedCount = bookings.filter(
      (booking) => String(booking.date).slice(0,10) === dayString&& ["Pending", "Confirmed"].includes(booking.bookingStatus)
    ).length;

    if (bookedCount >= allTimeSlots.length) return "Full";
    if (bookedCount > 0) return `${allTimeSlots.length - bookedCount} slots left`;
    return "Available";
  }

  if (isAdminPage) {
  return <AdminDashboard bookings={bookings} onRefresh={loadBookings} />;
}

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="max-w-6xl mx-auto px-5 py-12">
        <div className="grid lg:grid-cols-2 gap-10 items-center">

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
      className="w-full max-w-md rounded-3xl border border-neutral-800 object-cover shadow-2xl"
    />
  </div>

</div>
         

        <div className="grid lg:grid-cols-2 gap-8 mt-12">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 md:p-8">
            <h2 className="text-2xl font-semibold mb-6">Booking Form</h2>

            <div className="space-y-4">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your Name" className="w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-lime-400" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone Number" className="w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-lime-400" />
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-lime-400" />

              <select value={time} onChange={(e) => setTime(e.target.value)} disabled={availableSlots.length === 0} className="w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-lime-400">
                {availableSlots.length === 0 ? <option>No available slots</option> : availableSlots.map((slot) => <option key={slot}>{slot}</option>)}
              </select>

              {bookedForSelectedDate.length > 0 && (
                <p className="text-sm text-neutral-400">Unavailable: {bookedForSelectedDate.map((b) => b.time).join(", ")}</p>
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
                {loading ? "Please wait..." : "Book via WhatsApp"}
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
                  today.setHours(0,0,0,0);

                  const isPast = day && day < today;

                  return (
                    <button
                      key={index}
                      disabled={!day || isPast}
                      onClick={() => day && setDate(dayString)}
                      className={`min-h-20 rounded-2xl border p-2 text-left transition ${
  isPast
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
