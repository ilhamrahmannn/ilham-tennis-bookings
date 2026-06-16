/* global PagesFunction */

type Env = {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  ADMIN_EMAIL?: string;
  EMAIL_API_KEY?: string;
};

type BookingNotificationPayload = {
  name?: string;
  phone?: string;
  date?: string;
  time?: string;
  players?: number | string;
  duration?: number | string;
  location?: string;
  paymentStatus?: string;
  note?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function getEmailBody(payload: BookingNotificationPayload) {
  return [
    "New Booking Received",
    "",
    `Name: ${payload.name || "-"}`,
    `Phone: ${payload.phone || "-"}`,
    `Date: ${payload.date || "-"}`,
    `Time: ${payload.time || "-"}`,
    `Players: ${payload.players || "-"}`,
    `Duration: ${payload.duration || "-"} hour(s)`,
    `Location: ${payload.location || "-"}`,
    `Payment: ${payload.paymentStatus || "-"}`,
    `Note: ${payload.note || "-"}`,
  ].join("\n");
}

function getTelegramMessage(payload: BookingNotificationPayload) {
  return [
    "🎾 New Booking",
    "",
    `Name: ${payload.name || "-"}`,
    `Phone: ${payload.phone || "-"}`,
    `Date: ${payload.date || "-"}`,
    `Time: ${payload.time || "-"}`,
    `Players: ${payload.players || "-"}`,
    `Duration: ${payload.duration || "-"} hour(s)`,
    `Location: ${payload.location || "-"}`,
    `Payment: ${payload.paymentStatus || "-"}`,
    `Note: ${payload.note || "-"}`,
    "",
    "Admin:",
    "https://ilhamacademy.pages.dev/admin",
  ].join("\n");
}

async function sendEmail(env: Env, payload: BookingNotificationPayload) {
  if (!env.EMAIL_API_KEY) {
    return { skipped: true, reason: "Missing EMAIL_API_KEY" };
  }

  const to = env.ADMIN_EMAIL || "ilhamrahmannn@gmail.com";
  const subject = `New Booking - ${payload.name || "Client"} - ${payload.date || ""} ${payload.time || ""}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.EMAIL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Ilham Booking <onboarding@resend.dev>",
      to,
      subject,
      text: getEmailBody(payload),
    }),
  });

  if (!response.ok) {
    throw new Error(`Email API failed with ${response.status}`);
  }

  return { sent: true };
}

async function sendTelegram(env: Env, payload: BookingNotificationPayload) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return { skipped: true, reason: "Missing Telegram env vars" };
  }

  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: getTelegramMessage(payload),
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Telegram API failed with ${response.status}`);
  }

  return { sent: true };
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const payload = await request.json<BookingNotificationPayload>();
    const results = await Promise.allSettled([
      sendEmail(env, payload),
      sendTelegram(env, payload),
    ]);

    return jsonResponse({
      ok: true,
      results: results.map((result) =>
        result.status === "fulfilled"
          ? result.value
          : { error: result.reason instanceof Error ? result.reason.message : "Unknown error" }
      ),
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
};
