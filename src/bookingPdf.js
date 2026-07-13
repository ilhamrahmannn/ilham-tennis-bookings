function escapePdfText(value) {
  return String(value ?? "-")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
    .replace(/[^\x20-\x7E]/g, "-");
}

export function downloadBookingPdf(booking) {
  if (String(booking?.status || booking?.bookingStatus || "").toLowerCase() !== "confirmed") {
    throw new Error("PDF proof is only available for confirmed bookings.");
  }

  const lines = [
    "ILHAM TENNIS ACADEMY",
    "BOOKING CONFIRMATION",
    "",
    `Booking Reference: ${booking.bookingReference || "-"}`,
    `Customer Name: ${booking.customerName || booking.name || "-"}`,
    `Customer Email: ${booking.customerEmail || "-"}`,
    `Customer Phone: ${booking.customerPhone || booking.phone || "-"}`,
    `Coach: ${booking.coachName || "-"}`,
    `Date: ${booking.date || "-"}`,
    `Start Time: ${booking.startTime || booking.time || "-"}`,
    `End Time: ${booking.endTime || "-"}`,
    `Duration: ${booking.durationHours || booking.duration || "-"} hour(s)`,
    `Number of Players: ${booking.players || "-"}`,
    `Location: ${booking.location || "-"}`,
    `Court: ${booking.court || booking.courtOption || "-"}`,
    `Coaching Fee: RM${booking.coachingFee ?? "-"}`,
    "Booking Status: Confirmed",
    `Booking Created Date: ${booking.createdAt?.toDate?.()?.toLocaleString("en-MY") || "-"}`,
    "",
    "This document confirms that your booking request has been successfully recorded.",
    "Please contact the coach if any changes are required.",
  ];

  const content = lines.map((line, index) => `BT /F1 ${index < 2 ? 18 : 11} Tf 50 ${790 - index * 27} Td (${escapePdfText(line)}) Tj ET`).join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >> endobj",
    `4 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object) => { offsets.push(pdf.length); pdf += `${object}\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `Ilham-Tennis-Booking-${booking.bookingReference}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
