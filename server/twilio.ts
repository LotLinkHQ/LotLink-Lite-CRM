import twilio from "twilio";

let client: ReturnType<typeof twilio> | null = null;
let fromNumber: string | null = null;

function initTwilio(): boolean {
  if (client) return true;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phone = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !phone) {
    console.warn("[Twilio] Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER — SMS disabled");
    return false;
  }

  client = twilio(accountSid, authToken);
  fromNumber = phone;
  console.log(`[Twilio] Connected - Phone: ${phone}`);
  return true;
}

export async function sendSMS(to: string, body: string): Promise<{ success: boolean; sid?: string; error?: string }> {
  try {
    if (!initTwilio()) {
      return { success: false, error: "Twilio not configured" };
    }

    const cleanTo = to.replace(/[^\d+]/g, "");
    const formattedTo = cleanTo.startsWith("+") ? cleanTo : `+1${cleanTo}`;

    if (cleanTo.includes("555")) {
      return { success: false, error: "Invalid phone number (test number)" };
    }

    const message = await client!.messages.create({
      body,
      from: fromNumber!,
      to: formattedTo,
    });

    console.log(`[Twilio] SMS sent to ${formattedTo}, SID: ${message.sid}`);
    return { success: true, sid: message.sid };
  } catch (error: any) {
    console.error(`[Twilio] SMS failed to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
}
