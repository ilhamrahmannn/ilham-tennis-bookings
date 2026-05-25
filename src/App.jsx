import React, { useEffect, useMemo, useState } from "react";
import { Calendar, Clock, Users, Phone, MapPin, Send, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";

const rates = {
  1: { 1: 120, 2: 240 },
  2: { 1: 150, 2: 300 },
};

const defaultTimeSlots = [
  "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM",
  "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM",
  "4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM",
  "8:00 PM", "9:00 PM", "10:00 PM"
];

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzGYhVxmTWBevznTwPJhPybl-mXjnkUn0pBHQSIgHhtYcNnIEYAjfFMxgR2C-MM0NVaZQ/exec";

export default function TennisBookingWebsite() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [players, setPlayers] = useState(1);
  const [duration, setDuration] = useState(1);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("7:00 AM");
  const [note, setNote] = useState("");
  const [availableSlots, setAvailableSlots] = useState(defaultTimeSlots);
  const [bookedSlots, setBookedSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitStatus, setSubmitStatus] = useState("");
  const [locationType, setLocationType] = useState("Tennis Nusa Duta");
  const [customLocation, setCustomLocation] = useState("");

  const courtRentalRates = {
    day: { outdoor: 10, indoor: 15 },
    night: { outdoor: 20, indoor: 30 },
  };

  const courtBookingLink = "https://booking.stadiumjohor.my/product-tag/tennis/";

  const price = useMemo(() => rates[players]?.[duration] || 0, [players, duration]);

  useEffect(() => {
    if (!date || GOOGLE_SCRIPT_URL.includes("PASTE_YOUR")) return;

    async function loadSlots() {
      setLoadingSlots(true);
      try {
        const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=getSlots&date=${date}`);
        const data = await response.json();
        setAvailableSlots(data.availableSlots || defaultTimeSlots);
        setBookedSlots(data.bookedSlots || []);
        if (data.availableSlots?.length && !data.availableSlots.includes(time)) {
          setTime(data.availableSlots[0]);
        }
      } catch (error) {
        console.error("Failed to load slots", error);
        setAvailableSlots(defaultTimeSlots);
      } finally {
        setLoadingSlots(false);
      }
    }

    loadSlots();
  }, [date]);

  async function submitToGoogleSheet() {
    if (!name || !phone || !date || !time) {
      setSubmitStatus("Please fill in name, phone, date and time before booking.");
      return false;
    }

    if (GOOGLE_SCRIPT_URL.includes("PASTE_YOUR")) {
      return true;
    }

    setSubmitStatus("Saving booking...");

    const bookingData = {
      name,
      phone,
      date,
      time,
      players,
      duration,
      location: locationType === "Client location" ? customLocation || "Client preferred location" : "Tennis Nusa Duta",
      note,
      coachingFee: price,
      courtRental: "Not included",
    };

    try {
      const response = await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookingData),
      });
      setSubmitStatus("Booking saved. Opening WhatsApp...");
      return true;
    } catch (error) {
      console.error("Failed to submit booking", error);
      setSubmitStatus("Booking could not be saved to Google Sheet. WhatsApp will still open.");
      return true;
    }
  }

  const whatsappNumber = "601137507963"; // Tukar kepada nombor WhatsApp coach

  const message = encodeURIComponent(
    `Hi Coach Ilham, saya nak booking slot coaching tennis.\n\n` +
    `Nama: ${name || "-"}\n` +
    `No. Telefon: ${phone || "-"}\n` +
    `Tarikh: ${date || "-"}\n` +
    `Masa: ${time}
` +
    `Lokasi: ${locationType === "Client location" ? customLocation || "Lokasi pilihan client" : "Tennis Nusa Duta"}
` +
    `Bilangan pemain: ${players}\n` +
    `Durasi: ${duration} jam\n` +
    `Coaching fee: RM${price}
` +
    `Court rental: Not included. Client may book court here: ${courtBookingLink}
` +
    `Nota: ${note || "-"}\n\n` +
    `Boleh confirm slot ini?`
  );

  const whatsappLink = `https://wa.me/${whatsappNumber}?text=${message}`;

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(132,204,22,0.25),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.18),transparent_35%)]" />
        <div className="relative mx-auto max-w-6xl px-5 py-16 md:py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="grid gap-10 md:grid-cols-2 md:items-center"
          >
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-lime-400/30 bg-lime-400/10 px-4 py-2 text-sm text-lime-200">
                <CheckCircle2 size={16} /> ITF Coaching Level 1 & Sport Science Level 1
              </div>
              <h1 className="text-4xl font-bold tracking-tight md:text-6xl">
                Book Your Tennis Coaching Slot
              </h1>
              <p className="mt-5 max-w-xl text-lg text-neutral-300">
                Certified ITF Coaching Level 1 and Sport Science Level 1. Coaching for beginners, juniors and players who want to improve with structured tennis training.
              </p>
              <div className="mt-7 flex flex-wrap gap-3 text-sm text-neutral-300">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2"><Users size={16} /> Private & Pair Coaching</span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2"><Clock size={16} /> 1 or 2 hour session</span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2"><MapPin size={16} /> Tennis Nusa Duta / Client location</span>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur md:p-7">
              <h2 className="text-2xl font-semibold">Book a slot</h2>
              <p className="mt-1 text-sm text-neutral-300">Based at Nusa Duta Tennis Complex. Fill in details and send booking request through WhatsApp.</p>

              <div className="mt-6 grid gap-4">
                <label className="grid gap-2 text-sm">
                  Name
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="rounded-2xl border border-white/10 bg-neutral-900 px-4 py-3 outline-none focus:border-lime-400" />
                </label>

                <label className="grid gap-2 text-sm">
                  Phone number
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Example: 0123456789" className="rounded-2xl border border-white/10 bg-neutral-900 px-4 py-3 outline-none focus:border-lime-400" />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm">
                    Date
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-2xl border border-white/10 bg-neutral-900 px-4 py-3 outline-none focus:border-lime-400" />
                  </label>
                  <label className="grid gap-2 text-sm">
                    Time
                    <select value={time} onChange={(e) => setTime(e.target.value)} className="rounded-2xl border border-white/10 bg-neutral-900 px-4 py-3 outline-none focus:border-lime-400">
                      {availableSlots.map((slot) => <option key={slot}>{slot}</option>)}
                    </select>
                    {loadingSlots && <span className="text-xs text-neutral-400">Checking Google Sheet...</span>}
                    {!loadingSlots && date && bookedSlots.length > 0 && (
                      <span className="text-xs text-neutral-400">Booked slots hidden: {bookedSlots.join(", ")}</span>
                    )}
                  </label>
                </div>

                <label className="grid gap-2 text-sm">
                  Location
                  <select value={locationType} onChange={(e) => setLocationType(e.target.value)} className="rounded-2xl border border-white/10 bg-neutral-900 px-4 py-3 outline-none focus:border-lime-400">
                    <option value="Tennis Nusa Duta">Tennis Nusa Duta</option>
                    <option value="Client location">Client preferred location</option>
                  </select>
                </label>

                {locationType === "Client location" && (
                  <label className="grid gap-2 text-sm">
                    Client location details
                    <input value={customLocation} onChange={(e) => setCustomLocation(e.target.value)} placeholder="Example: court name / area / full address" className="rounded-2xl border border-white/10 bg-neutral-900 px-4 py-3 outline-none focus:border-lime-400" />
                  </label>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm">
                    Players
                    <select value={players} onChange={(e) => setPlayers(Number(e.target.value))} className="rounded-2xl border border-white/10 bg-neutral-900 px-4 py-3 outline-none focus:border-lime-400">
                      <option value={1}>1 player</option>
                      <option value={2}>2 players</option>
                      
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm">
                    Duration
                    <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="rounded-2xl border border-white/10 bg-neutral-900 px-4 py-3 outline-none focus:border-lime-400">
                      <option value={1}>1 hour</option>
                      <option value={2}>2 hours</option>
                    </select>
                  </label>
                </div>

                <label className="grid gap-2 text-sm">
                  Note
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Example: beginner, want to learn basic rally, location preference..." rows={3} className="rounded-2xl border border-white/10 bg-neutral-900 px-4 py-3 outline-none focus:border-lime-400" />
                </label>

                <div className="rounded-2xl border border-lime-400/20 bg-lime-400/10 p-4">
                  <div className="text-sm text-lime-100">Estimated price</div>
                  <div className="mt-1 text-3xl font-bold text-lime-300">RM{price}</div>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    const ok = await submitToGoogleSheet();
                    if (ok) window.open(whatsappLink, "_blank");
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-lime-400 px-5 py-4 font-semibold text-neutral-950 transition hover:bg-lime-300"
                >
                  <Send size={18} /> Book via WhatsApp
                </button>
                {submitStatus && <p className="text-sm text-neutral-300">{submitStatus}</p>}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12">
        <div className="grid gap-4 md:grid-cols-4">
          {Object.entries(rates).map(([player, data]) => (
            <div key={player} className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
              <div className="flex items-center gap-2 text-lime-300"><Users size={18} /> {player} Player{Number(player) > 1 ? "s" : ""}</div>
              <div className="mt-4 space-y-2 text-neutral-300">
                <p>1 hour: <span className="font-semibold text-white">RM{data[1]}</span></p>
                <p>2 hours: <span className="font-semibold text-white">RM{data[2]}</span></p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-12">
        <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-6">
          <h2 className="text-2xl font-semibold text-white">Court Rental</h2>
          <p className="mt-2 text-sm text-neutral-300">Court rental is not included in coaching fee. Client can book the court through Stadium Johor booking website.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-neutral-900 p-5">
              <div className="font-semibold text-lime-300">Day Session</div>
              <div className="mt-1 text-sm text-neutral-400">8:00 AM – 7:00 PM</div>
              <div className="mt-4 space-y-2 text-neutral-300">
                <p>Outdoor: <span className="font-semibold text-white">RM{courtRentalRates.day.outdoor}/hour</span></p>
                <p>Indoor: <span className="font-semibold text-white">RM{courtRentalRates.day.indoor}/hour</span></p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-neutral-900 p-5">
              <div className="font-semibold text-lime-300">Night Session</div>
              <div className="mt-1 text-sm text-neutral-400">7:00 PM – 12:00 AM</div>
              <div className="mt-4 space-y-2 text-neutral-300">
                <p>Outdoor: <span className="font-semibold text-white">RM{courtRentalRates.night.outdoor}/hour</span></p>
                <p>Indoor: <span className="font-semibold text-white">RM{courtRentalRates.night.indoor}/hour</span></p>
              </div>
            </div>
          </div>
          <a href={courtBookingLink} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center justify-center rounded-2xl border border-lime-400/40 px-5 py-3 font-semibold text-lime-300 transition hover:bg-lime-400 hover:text-neutral-950">
            Book Court at Stadium Johor
          </a>
        </div>
      </section>

      <footer className="border-t border-white/10 px-5 py-8 text-center text-sm text-neutral-400">
        <div className="flex items-center justify-center gap-2"><Phone size={16} /> Coach Ilham Tennis Coaching</div>
      </footer>
    </div>
  );
}
