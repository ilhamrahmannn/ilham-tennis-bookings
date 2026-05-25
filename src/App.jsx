import { useMemo, useState } from "react";

const rates = {
  1: { 1: 120, 2: 240 },
  2: { 1: 150, 2: 300 },
};

const timeSlots = [
  "8:00 AM",
  "9:00 AM",
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "1:00 PM",
  "2:00 PM",
  "3:00 PM",
  "4:00 PM",
  "5:00 PM",
  "6:00 PM",
  "7:00 PM",
  "8:00 PM",
  "9:00 PM",
  "10:00 PM",
];

export default function App() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [players, setPlayers] = useState(1);
  const [duration, setDuration] = useState(1);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("8:00 AM");
  const [location, setLocation] = useState("Tennis Nusa Duta");
  const [note, setNote] = useState("");

  const price = useMemo(() => {
    return rates[players][duration];
  }, [players, duration]);

  const whatsappMessage = encodeURIComponent(`
Hi Coach Ilham,

I want to book a tennis coaching slot.

Name: ${name}
Phone: ${phone}
Date: ${date}
Time: ${time}
Players: ${players}
Duration: ${duration} hour(s)
Location: ${location}
Coaching Fee: RM${price}

Note:
${note}
`);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="max-w-5xl mx-auto px-5 py-14">

        <div className="text-center">
          <h1 className="text-5xl font-bold">
            Book Your Tennis Coaching Slot
          </h1>

          <p className="mt-5 text-neutral-300 text-lg">
            Certified ITF Coaching Level 1 and Sport Science Level 1
          </p>

          <p className="mt-2 text-neutral-400">
            Based at Nusa Duta Tennis Complex
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-10 mt-14">

          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8">

            <h2 className="text-2xl font-semibold mb-6">
              Booking Form
            </h2>

            <div className="space-y-5">

              <input
                type="text"
                placeholder="Your Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3"
              />

              <input
                type="text"
                placeholder="Phone Number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3"
              />

              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3"
              />

              <select
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3"
              >
                {timeSlots.map((slot) => (
                  <option key={slot}>{slot}</option>
                ))}
              </select>

              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3"
              >
                <option>Tennis Nusa Duta</option>
                <option>Client Preferred Location</option>
              </select>

              <div className="grid grid-cols-2 gap-4">

                <select
                  value={players}
                  onChange={(e) => setPlayers(Number(e.target.value))}
                  className="rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3"
                >
                  <option value={1}>1 Player</option>
                  <option value={2}>2 Players</option>
                </select>

                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3"
                >
                  <option value={1}>1 Hour</option>
                  <option value={2}>2 Hours</option>
                </select>

              </div>

              <textarea
                rows="4"
                placeholder="Notes"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-2xl bg-neutral-800 border border-neutral-700 px-4 py-3"
              />

              <div className="bg-lime-400 text-black rounded-2xl p-5 text-center">
                <div className="text-sm font-medium">
                  Estimated Coaching Fee
                </div>

                <div className="text-4xl font-bold mt-1">
                  RM{price}
                </div>
              </div>

              <a
                href={`https://wa.me/601137507963?text=${whatsappMessage}`}
                target="_blank"
                className="block text-center bg-white text-black rounded-2xl py-4 font-semibold hover:bg-neutral-200 transition"
              >
                Book via WhatsApp
              </a>

            </div>
          </div>

          <div className="space-y-6">

            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8">
              <h2 className="text-2xl font-semibold mb-5">
                Coaching Rates
              </h2>

              <div className="space-y-4 text-neutral-300">

                <div>
                  <div className="font-semibold text-white">
                    1 Player
                  </div>

                  <div>1 Hour — RM120</div>
                  <div>2 Hours — RM240</div>
                </div>

                <div>
                  <div className="font-semibold text-white">
                    2 Players
                  </div>

                  <div>1 Hour — RM150</div>
                  <div>2 Hours — RM300</div>
                </div>

              </div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8">
              <h2 className="text-2xl font-semibold mb-5">
                Court Rental
              </h2>

              <div className="space-y-5 text-neutral-300">

                <div>
                  <div className="font-semibold text-white">
                    Day Session
                  </div>

                  <div>8AM - 7PM</div>
                  <div>Outdoor RM10/hour</div>
                  <div>Indoor RM15/hour</div>
                </div>

                <div>
                  <div className="font-semibold text-white">
                    Night Session
                  </div>

                  <div>7PM - 12AM</div>
                  <div>Outdoor RM20/hour</div>
                  <div>Indoor RM30/hour</div>
                </div>

              </div>

              <a
                href="https://booking.stadiumjohor.my/product-tag/tennis/"
                target="_blank"
                className="inline-block mt-6 text-lime-400 hover:text-lime-300"
              >
                Book Court at Stadium Johor →
              </a>

            </div>

          </div>

        </div>
      </div>
    </div>
  );
}