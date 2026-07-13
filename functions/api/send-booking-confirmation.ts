/* global PagesFunction */

type Env = { EMAIL_API_KEY?: string; EMAIL_FROM?: string };

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

    const firestoreResponse = await fetch(`https://firestore.googleapis.com/v1/projects/ilham-booking-website/databases/(default)/documents/bookings/${bookingId}`, { headers: { Authorization: authorization } });
    if (!firestoreResponse.ok) return json({ ok: false, error: "Booking not found or access denied" }, firestoreResponse.status === 403 ? 403 : 404);
    const document = await firestoreResponse.json<any>();
    const fields = document.fields || {};
    if (String(value(fields, "status")).toLowerCase() !== "confirmed") return json({ ok: false, error: "Only confirmed bookings can be emailed" }, 409);
    if (value(fields, "confirmationEmailSent") === true) return json({ ok: true, alreadySent: true });
    if (!env.EMAIL_API_KEY) return json({ ok: false, error: "Missing EMAIL_API_KEY" }, 503);

    const customerName = value(fields, "customerName") || value(fields, "name") || "Customer";
    const customerEmail = value(fields, "customerEmail");
    const bookingReference = value(fields, "bookingReference");
    if (!customerEmail) return json({ ok: false, error: "Booking has no customer email" }, 400);
    const successUrl = `${new URL(request.url).origin}/booking/success/${bookingId}`;
    const text = [
      `Hi ${customerName},`, "", "Your tennis coaching booking has been confirmed.", "",
      `Booking Reference: ${bookingReference}`,
      `Coach: ${value(fields, "coachName") || "-"}`,
      `Date: ${value(fields, "date") || "-"}`,
      `Time: ${value(fields, "startTime") || value(fields, "time") || "-"} - ${value(fields, "endTime") || "-"}`,
      `Location: ${value(fields, "location") || "-"}`, "",
      `View or download your secure booking proof: ${successUrl}`, "", "Thank you.",
    ].join("\n");

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.EMAIL_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `booking-confirmation-${bookingId}` },
      body: JSON.stringify({ from: env.EMAIL_FROM || "Ilham Tennis Academy <onboarding@resend.dev>", to: customerEmail, subject: "Booking Confirmed – Ilham Tennis Academy", text }),
    });
    if (!emailResponse.ok) return json({ ok: false, error: "Email delivery failed" }, 502);
    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
};
