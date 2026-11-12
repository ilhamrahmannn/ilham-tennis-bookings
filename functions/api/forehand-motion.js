const frames = [
  // Pelvis, shoulders, elbows, hands, knees, feet, racket tip and ball.
  [[0,1,0], [.22,1.46,0], [-.22,1.46,0], [.33,1.22,.17], [-.3,1.24,.16], [.19,1.17,.39], [-.02,1.21,.4], [.25,.55,.13], [-.25,.55,.14], [.33,.06,0], [-.34,.06,.04], [-.36,1.48,.54], [1.65,1.35,3.8]],
  [[.12,.96,-.03], [.25,1.43,-.22], [-.04,1.43,.11], [.51,1.26,-.34], [-.12,1.25,.36], [.73,1.15,-.51], [.09,1.25,.5], [.31,.53,.1], [-.2,.52,.19], [.38,.06,-.16], [-.33,.06,.16], [.94,1.43,-1.09], [1.28,.92,2.65]],
  [[.15,.91,.02], [.34,1.37,-.13], [-.01,1.38,.12], [.59,1.09,-.22], [-.17,1.19,.33], [.75,.92,-.04], [.04,1.16,.48], [.32,.51,.17], [-.21,.51,.21], [.38,.06,-.16], [-.33,.06,.16], [1.23,.64,-.38], [1.05,.49,1.58]],
  [[.06,1,.14], [.28,1.47,.2], [-.16,1.46,.08], [.49,1.25,.38], [-.29,1.24,.11], [.71,1.17,.57], [-.32,1.15,.27], [.29,.55,.19], [-.2,.56,.27], [.38,.13,-.06], [-.33,.06,.16], [1.32,1.22,.65], [1.04,1.2,.61]],
  [[-.09,1.08,.25], [.06,1.54,.43], [-.24,1.54,.08], [.05,1.42,.71], [-.42,1.34,.16], [-.32,1.65,.42], [-.44,1.2,.31], [.19,.59,.24], [-.27,.56,.3], [.35,.16,-.01], [-.33,.06,.16], [-.54,1.77,-.17], [.4,1.93,3.7]],
  [[-.14,1.07,.26], [-.02,1.53,.44], [-.26,1.54,.06], [-.07,1.41,.65], [-.39,1.3,.14], [-.42,1.57,.37], [-.41,1.16,.3], [.14,.57,.25], [-.29,.56,.31], [.3,.12,.06], [-.33,.06,.16], [-.6,1.65,-.22], [-.62,2.15,9]],
];
const times = [0, 1.15, 1.65, 2, 2.55, 3.2];

function reply(status, data) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function onRequestGet({ request }) {
  const authorization = request.headers.get("Authorization");
  const uid = new URL(request.url).searchParams.get("uid");
  if (!authorization?.startsWith("Bearer ")) return reply(401, { error: "Sign in required." });
  if (!uid || !/^[a-zA-Z0-9_-]{1,128}$/.test(uid)) return reply(400, { error: "Invalid account." });

  try {
    const response = await fetch(
      "https://firestore.googleapis.com/v1/projects/ilham-booking-website/databases/(default)/documents/forehandAccess/" + encodeURIComponent(uid),
      { headers: { Authorization: authorization, "Cache-Control": "no-store" } },
    );
    if ([401, 403, 404].includes(response.status)) return reply(403, { error: "Approval required." });
    if (!response.ok) return reply(502, { error: "Could not verify access." });
    const document = await response.json();
    if (document.fields?.status?.stringValue !== "approved") return reply(403, { error: "Approval required." });
    return reply(200, { frames, times });
  } catch {
    return reply(502, { error: "Could not verify access." });
  }
}
