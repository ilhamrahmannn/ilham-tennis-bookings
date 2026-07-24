function escapePdfText(value) {
  return String(value ?? "-")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
    .replace(/[^\x20-\x7E]/g, "-");
}

function normalizedStatus(booking) {
  return String(booking?.status || booking?.bookingStatus || "").trim().toLowerCase();
}

function formatTimestamp(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function parseTimeText(timeText) {
  const match = String(timeText || "").trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3].toUpperCase();

  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;

  return { hour, minute };
}

function formatTime(hour, minute) {
  const meridiem = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

function getEndTime(booking) {
  if (booking.endTime) return booking.endTime;

  const start = parseTimeText(booking.startTime || booking.time);
  const duration = Number(booking.durationHours || booking.duration || 1);
  if (!start || !Number.isFinite(duration)) return "-";

  const totalMinutes = start.hour * 60 + start.minute + duration * 60;
  return formatTime(Math.floor(totalMinutes / 60) % 24, totalMinutes % 60);
}

function pdfColor(hex) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
}

function fillRect(commands, x, y, width, height, color) {
  commands.push(`${pdfColor(color)} rg ${x} ${y} ${width} ${height} re f`);
}

function strokeRect(commands, x, y, width, height, color, lineWidth = 1) {
  commands.push(`${lineWidth} w ${pdfColor(color)} RG ${x} ${y} ${width} ${height} re S`);
}

function drawText(commands, text, x, y, options = {}) {
  const font = options.bold ? "/F2" : "/F1";
  const size = options.size || 12;
  const color = options.color || "#ffffff";
  commands.push(`${pdfColor(color)} rg BT ${font} ${size} Tf ${x} ${y} Td (${escapePdfText(text)}) Tj ET`);
}

function drawWrappedText(commands, text, x, y, maxChars, options = {}) {
  const words = String(text || "-").split(/\s+/);
  const lines = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });

  if (current) lines.push(current);
  lines.forEach((line, index) => {
    drawText(commands, line, x, y - index * (options.lineHeight || 18), options);
  });

  return lines.length;
}

function drawDetailRow(commands, label, value, x, y, width = 205) {
  drawText(commands, label, x, y, { size: 9, color: "#a3a3a3" });
  drawWrappedText(commands, value || "-", x, y - 16, Math.floor(width / 7), {
    size: 11,
    color: "#ffffff",
    lineHeight: 13,
  });
  commands.push(`0.5 w ${pdfColor("#262626")} RG ${x} ${y - 34} ${width} 0 m ${x + width} ${y - 34} l S`);
}

export function downloadBookingPdf(booking) {
  if (normalizedStatus(booking) !== "confirmed") {
    throw new Error("PDF proof is only available for confirmed bookings.");
  }

  const reference = booking.bookingReference || "PENDING";
  const customerName = booking.customerName || booking.name || "-";
  const customerEmail = booking.customerEmail || "-";
  const customerPhone = booking.customerPhone || booking.phone || "-";
  const startTime = booking.startTime || booking.time || "-";
  const endTime = getEndTime(booking);
  const duration = booking.durationHours || booking.duration || "-";
  const court = booking.court || booking.courtOption || "-";
  const coachingFee = booking.coachingFee ?? "-";

  const commands = [];
  fillRect(commands, 0, 0, 595, 842, "#050505");
  fillRect(commands, 42, 52, 511, 738, "#171717");
  strokeRect(commands, 42, 52, 511, 738, "#2a2a2a", 1.2);

  drawText(commands, "Booking Confirmed", 74, 738, { bold: true, size: 30, color: "#ffffff" });
  drawWrappedText(commands, "Your booking has been successfully confirmed.", 74, 698, 36, {
    size: 17,
    color: "#d4d4d4",
    lineHeight: 24,
  });

  fillRect(commands, 74, 586, 447, 94, "#18270f");
  drawText(commands, "Booking Reference", 98, 637, { size: 13, color: "#b9f86a" });
  drawWrappedText(commands, reference, 98, 598, 25, { bold: true, size: 25, color: "#9af000", lineHeight: 27 });

  const rows = [
    ["Customer", customerName],
    ["Email", customerEmail],
    ["Phone", customerPhone],
    ["Coach", booking.coachName || "-"],
    ["Date", booking.date || "-"],
    ["Time", `${startTime} - ${endTime}`],
    ["Duration", `${duration} hour(s)`],
    ["Players", `${booking.players || "-"}`],
    ["Location", booking.location || "-"],
    ["Court", court],
    ["Coaching Fee", `RM${coachingFee}`],
    ["Booking Status", "Confirmed"],
    ["Booking Created", formatTimestamp(booking.createdAt)],
  ];

  const detailStartY = 548;
  const detailColumns = [74, 304];
  const detailColumnWidth = 205;

  rows.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    drawDetailRow(commands, label, value, detailColumns[column], detailStartY - row * 58, detailColumnWidth);
  });

  fillRect(commands, 74, 64, 447, 54, "#101010");
  drawWrappedText(
    commands,
    "This document confirms that your booking request has been successfully recorded. Please contact the coach if any changes are required.",
    92,
    95,
    72,
    { size: 9, color: "#bdbdbd", lineHeight: 12 }
  );

  const content = commands.join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >> endobj",
    `4 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    "6 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object) => {
    offsets.push(pdf.length);
    pdf += `${object}\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `Ilham-Tennis-Booking-${reference}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

