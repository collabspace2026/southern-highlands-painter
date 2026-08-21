export async function onRequestPost({ request, env }) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const { name, mobile, email, location, message, token, website } = data;

  // Honeypot: bots fill hidden fields. Pretend success so they don't retry.
  if (website) {
    return json({ success: true });
  }

  if (!name || !mobile || !email || !location || !message || !token) {
    return json({ error: "Please fill in all fields." }, 400);
  }

  const verify = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      secret: env.TURNSTILE_SECRET,
      response: token,
      remoteip: request.headers.get("CF-Connecting-IP") || "",
    }),
  });
  const verifyResult = await verify.json();
  if (!verifyResult.success) {
    return json({ error: "Verification failed. Please try again." }, 403);
  }

  const subject = `Website enquiry from ${name} (${location})`;
  const body =
    `Name: ${name}\n` +
    `Mobile: ${mobile}\n` +
    `Email: ${email}\n` +
    `Location: ${location}\n\n` +
    `${message}`;

  let emailSent = false;
  if (env.RESEND_API_KEY && env.RESEND_FROM && env.TO_EMAIL) {
    try {
      const resendResp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.RESEND_FROM,
          to: env.TO_EMAIL,
          cc: "thriiv.au@gmail.com",
          reply_to: email,
          subject,
          text: body,
        }),
      });
      emailSent = resendResp.ok;
    } catch {
      emailSent = false;
    }
  }

  let webhookSent = false;
  if (env.MAKE_WEBHOOK_URL) {
    try {
      const webhookResp = await fetch(env.MAKE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, mobile, email, location, message }),
      });
      webhookSent = webhookResp.ok;
    } catch {
      webhookSent = false;
    }
  }

  if (!emailSent && !webhookSent) {
    return json({ error: "Sorry, something went wrong sending your enquiry. Please call us directly." }, 502);
  }

  return json({ success: true });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
