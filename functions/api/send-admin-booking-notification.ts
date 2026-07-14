/* global PagesFunction */

type Env = { EMAIL_API_KEY?: string; EMAIL_FROM?: string; ADMIN_EMAIL?: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function value(fields: Record<string, any>, key: string) {
  const field = fields?.[key] || {};
  return field.stringValue ?? field.integerValue ?? field.doubleValue ?? field.booleanValue ?? "";
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const authorization = request.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json({ ok: false, error: "Authentication required" }, 401);
    const { bookingId } = await request.json<{ bookingId?: string }>();
    if (!bookingId || !/^[a-zA-Z0-9_-]+$/.test(bookingId)) return json({ ok: false, error: "Invalid booking" }, 400);
    if (!env.EMAIL_API_KEY) return json({ ok: false, error: "Missing EMAIL_API_KEY" }, 503);

    const firestoreResponse = await fetch(`https://firestore.googleapis.com/v1/projects/ilham-booking-website/databases/(default)/documents/bookings/${bookingId}`, { headers: { Authorization: authorization } });
    if (!firestoreResponse.ok) return json({ ok: false, error: "Booking not found or access denied" }, firestoreResponse.status === 403 ? 403 : 404);
    const document = await firestoreResponse.json<any>();
    const fields = document.fields || {};
    const customerName = value(fields, "customerName") || value(fields, "name") || "Customer";
    const text = [
      "A customer submitted a new tennis coaching booking request.", "",
      `Customer: ${customerName}`,
      `Phone: ${value(fields, "customerPhone") || value(fields, "phone") || "-"}`,
      `Email: ${value(fields, "customerEmail") || "-"}`,
      `Coach: ${value(fields, "coachName") || "-"}`,
      `Date: ${value(fields, "date") || "-"}`,
      `Time: ${value(fields, "startTime") || value(fields, "time") || "-"}`,
      `Duration: ${value(fields, "durationHours") || value(fields, "duration") || "-"} hour(s)`,
      `Location: ${value(fields, "location") || "-"}`,
      `Court: ${value(fields, "courtOption") || value(fields, "court") || "-"}`, "",
      "Open the admin dashboard to review the request.",
    ].join("\n");

    const adminEmails = (env.ADMIN_EMAIL || "ilhamrahmannn@gmail.com").split(",");
    const coachEmail = String(value(fields, "coachEmail") || "").trim();
    const recipients = [...new Map(
      [...adminEmails, coachEmail]
        .map((email) => email.trim())
        .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        .map((email) => [email.toLowerCase(), email])
    ).values()];
    if (!recipients.length) return json({ ok: false, error: "No valid coach or admin email configured" }, 503);
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.EMAIL_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `admin-booking-${bookingId}` },
      body: JSON.stringify({ from: env.EMAIL_FROM || "Ilham Tennis Academy <onboarding@resend.dev>", to: recipients, subject: `New Booking Request – ${customerName}`, text }),
    });
    if (!emailResponse.ok) return json({ ok: false, error: "Email delivery failed" }, 502);
    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
};
