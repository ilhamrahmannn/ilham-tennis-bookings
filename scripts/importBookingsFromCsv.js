/* global process */

import { readFile } from "node:fs/promises";
import { initializeApp } from "firebase/app";
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBYeSkJSMosOgKu8eJf5JrI4SjEJZ0biBQ",
  authDomain: "ilham-booking-website.firebaseapp.com",
  projectId: "ilham-booking-website",
  storageBucket: "ilham-booking-website.firebasestorage.app",
  messagingSenderId: "87944263402",
  appId: "1:87944263402:web:c7abc6a6708a7ade3e0993",
  measurementId: "G-7T9MKWGXNC",
};

const mandatoryColumns = ["Date", "Time"];
const batchLimit = 450;
const blockedTextPattern =
  /\b(n\/a|blocked?|not available|manual block|existing schedule block|emergency)\b/i;
const naPattern = /(^|[^a-z0-9])n\s*\/?\s*a([^a-z0-9]|$)/i;

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      value += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") i++;
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);

  return rows;
}

function normalizeHeader(header) {
  return String(header || "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

function getCell(csvRow, headerMap, column) {
  const index = headerMap.get(normalizeHeader(column));
  return index === undefined ? "" : String(csvRow[index] || "").trim();
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return [
      isoMatch[1],
      isoMatch[2].padStart(2, "0"),
      isoMatch[3].padStart(2, "0"),
    ].join("-");
  }

  const slashMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const year =
      slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    return [
      year,
      slashMatch[2].padStart(2, "0"),
      slashMatch[1].padStart(2, "0"),
    ].join("-");
  }

  const parsedDate = new Date(text);
  if (!Number.isNaN(parsedDate.getTime())) {
    const year = parsedDate.getFullYear();
    const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
    const day = String(parsedDate.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return text;
}

function getBookingType(row) {
  const timestamp = String(row.timestamp || "");
  const note = String(row.note || "");
  const name = String(row.name || "");

  return /manual block/i.test(timestamp) ||
    blockedTextPattern.test(note) ||
    naPattern.test(note) ||
    /blocked/i.test(name)
    ? "blocked"
    : "booking";
}

function toNumber(value, fallback) {
  const number = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : fallback;
}

function getDuplicateKey(booking) {
  return [
    String(booking.date || "").trim().toLowerCase(),
    String(booking.time || "").trim().toLowerCase(),
    String(booking.type || "").trim().toLowerCase(),
  ].join("|");
}

async function getExistingDuplicateKeys(bookingsCollection) {
  const snapshot = await getDocs(bookingsCollection);
  return new Set(
    snapshot.docs.map((bookingDoc) => {
      const booking = bookingDoc.data();
      return getDuplicateKey(booking);
    })
  );
}

async function commitBatch(batch, pendingWrites) {
  if (pendingWrites === 0) return;
  await batch.commit();
}

async function importBookings(csvPath) {
  if (!csvPath) {
    throw new Error("Usage: npm run import:bookings -- path/to/bookings.csv");
  }

  const csvText = await readFile(csvPath, "utf8");
  const [headers, ...rows] = parseCsv(csvText);

  if (!headers || headers.length === 0) {
    throw new Error("CSV file is empty or missing a header row.");
  }

  const headerMap = new Map(
    headers.map((header, index) => [normalizeHeader(header), index])
  );
  const missingColumns = mandatoryColumns.filter(
    (column) => !headerMap.has(normalizeHeader(column))
  );

  if (missingColumns.length > 0) {
    throw new Error(`Missing required CSV columns: ${missingColumns.join(", ")}`);
  }

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const bookingsCollection = collection(db, "bookings");
  const existingKeys = await getExistingDuplicateKeys(bookingsCollection);

  let skippedMissingRequired = 0;
  let imported = 0;
  let skippedDuplicates = 0;
  let blockedSlots = 0;
  let normalBookings = 0;
  let pendingWrites = 0;
  let batch = writeBatch(db);

  for (const csvRow of rows) {
    const row = {
      timestamp: getCell(csvRow, headerMap, "Timestamp"),
      name: getCell(csvRow, headerMap, "Name"),
      phone: getCell(csvRow, headerMap, "Phone"),
      date: getCell(csvRow, headerMap, "Date"),
      time: getCell(csvRow, headerMap, "Time"),
      players: getCell(csvRow, headerMap, "Players"),
      duration: getCell(csvRow, headerMap, "Duration"),
      location: getCell(csvRow, headerMap, "Location"),
      coachingFee: getCell(csvRow, headerMap, "Coaching Fee"),
      paymentStatus: getCell(csvRow, headerMap, "Payment Status"),
      bookingStatus: getCell(csvRow, headerMap, "Booking Status"),
      note: getCell(csvRow, headerMap, "Note"),
    };
    const type = getBookingType(row);
    const isBlocked = type === "blocked";

    const booking = {
      name: row.name || (isBlocked ? "Blocked" : ""),
      phone: row.phone || "",
      date: normalizeDate(row.date),
      time: row.time,
      players: toNumber(row.players, 1),
      duration: toNumber(row.duration, 1),
      location: row.location || "Tennis Nusa Duta",
      coachingFee: toNumber(row.coachingFee, 0),
      paymentStatus: row.paymentStatus || (isBlocked ? "N/A" : "Unpaid"),
      bookingStatus: row.bookingStatus || "Confirmed",
      note: row.note || (isBlocked ? "N/A" : ""),
      type,
      createdAt: serverTimestamp(),
    };
    const duplicateKey = getDuplicateKey(booking);

    if (!booking.date || !booking.time) {
      skippedMissingRequired++;
      console.warn("Skipped row with missing date or time:", row);
      continue;
    }

    if (existingKeys.has(duplicateKey)) {
      skippedDuplicates++;
      console.log(
        `Skipped duplicate: ${booking.date} ${booking.time} ${booking.type}`
      );
      continue;
    }

    batch.set(doc(bookingsCollection), booking);
    existingKeys.add(duplicateKey);
    imported++;
    if (booking.type === "blocked") {
      blockedSlots++;
    } else {
      normalBookings++;
    }
    pendingWrites++;

    if (pendingWrites >= batchLimit) {
      await commitBatch(batch, pendingWrites);
      batch = writeBatch(db);
      pendingWrites = 0;
    }
  }

  await commitBatch(batch, pendingWrites);

  console.log("Import complete.");
  console.log(`Total rows: ${rows.length}`);
  console.log(`Imported: ${imported}`);
  console.log(`Skipped duplicates: ${skippedDuplicates}`);
  console.log(`Skipped missing required: ${skippedMissingRequired}`);
  console.log(`Blocked slots: ${blockedSlots}`);
  console.log(`Normal bookings: ${normalBookings}`);
}

importBookings(process.argv[2]).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
