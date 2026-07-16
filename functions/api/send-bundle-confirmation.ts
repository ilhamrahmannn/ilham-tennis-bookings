/* global PagesFunction */

type Env = { EMAIL_API_KEY?: string; EMAIL_FROM?: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function value(fields: Record<string, any>, key: string) {
  const field = fields?.[key] || {};
  return field.stringValue ?? field.integerValue ?? field.doubleValue ?? field.booleanValue ?? "";
}

function validBookingIds(input: unknown): string[] {
  if (!Array.isArray(input) || input.length < 2 || input.length > 12) return [];
  const ids = [...new Set(input.map(String))];
  return ids.length === input.length && ids.every((id) => /^[a-zA-Z0-9_-]+$/.test(id)) ? ids : [];
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const authorization = request.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json({ ok: false, error: "Authentication required" }, 401);
    const body = await request.json<{ bookingIds?: unknown }>();
    const bookingIds = validBookingIds(body.bookingIds);
    if (!bookingIds.length) return json({ ok: false, error: "Invalid bundle bookings" }, 400);
    if (!env.EMAIL_API_KEY) return json({ ok: false, error: "Missing EMAIL_API_KEY" }, 503);

    const responses = await Promise.all(bookingIds.map((bookingId) => fetch(
      `https://firestore.googleapis.com/v1/projects/ilham-booking-website/databases/(default)/documents/bookings/${bookingId}`,
      { headers: { Authorization: authorization } }
    )));
    if (responses.some((response) => !response.ok)) return json({ ok: false, error: "Bundle booking not found or access denied" }, 403);
    const documents = await Promise.all(responses.map((response) => response.json<any>()));
    const sessions = documents.map((document, index) => ({ id: bookingIds[index], fields: document.fields || {} }))
      .sort((a, b) => Number(value(a.fields, "bundleIndex")) - Number(value(b.fields, "bundleIndex")));
    const first = sessions[0].fields;
    const bundleId = value(first, "bundleId");
    const customerId = value(first, "customerId");
    if (!bundleId || sessions.some((session) => value(session.fields, "bundleId") !== bundleId || value(session.fields, "customerId") !== customerId)) {
      return json({ ok: false, error: "Bookings do not belong to the same bundle" }, 409);
    }
    if (sessions.some((session) => String(value(session.fields, "status")).toLowerCase() !== "confirmed")) {
      return json({ ok: false, error: "All bundle sessions must be confirmed" }, 409);
    }
    if (sessions.every((session) => value(session.fields, "confirmationEmailSent") === true)) return json({ ok: true, alreadySent: true });

    const customerName = value(first, "customerName") || value(first, "name") || "Customer";
    const customerEmail = value(first, "customerEmail");
    if (!customerEmail) return json({ ok: false, error: "Bundle has no customer email" }, 400);
    const successUrl = `${new URL(request.url).origin}/booking/success/${sessions[0].id}`;
    const lines = sessions.map((session, index) => {
      const fields = session.fields;
      return `${index + 1}. ${value(fields, "date")} · ${value(fields, "startTime") || value(fields, "time")} - ${value(fields, "endTime")} · ${value(fields, "location")}`;
    });
    const text = [
      `Hi ${customerName},`, "", "Your tennis coaching bundle has been confirmed.", "",
      `Bundle Reference: ${value(first, "bundleReference") || bundleId}`,
      `Coach: ${value(first, "coachName") || "-"}`,
      `Sessions: ${sessions.length}`, "", ...lines, "",
      `View your confirmed sessions: ${successUrl}`, "", "Thank you.",
    ].join("\n");

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.EMAIL_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `bundle-confirmation-${bundleId}` },
      body: JSON.stringify({ from: env.EMAIL_FROM || "Ilham Tennis Academy <onboarding@resend.dev>", to: customerEmail, subject: "Booking Bundle Confirmed - Ilham Tennis Academy", text }),
    });
    if (!emailResponse.ok) return json({ ok: false, error: "Email delivery failed" }, 502);
    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
};
