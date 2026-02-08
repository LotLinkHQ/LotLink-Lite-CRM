import twilio from "twilio";

let cachedCredentials: {
  accountSid: string;
  apiKey: string;
  apiKeySecret: string;
  phoneNumber: string;
} | null = null;

async function getCredentials() {
  if (cachedCredentials) return cachedCredentials;

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error("X_REPLIT_TOKEN not found for repl/depl");
  }

  const connUrl = "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=twilio";
  const connRes = await fetch(connUrl, {
    headers: {
      Accept: "application/json",
      X_REPLIT_TOKEN: xReplitToken,
    },
  });
  const connData = await connRes.json();
  const connectionSettings = connData.items?.[0];

  if (!connectionSettings) {
    throw new Error("Twilio not connected");
  }

  const accountSid = connectionSettings.settings?.account_sid;
  const apiKey = connectionSettings.settings?.api_key;
  const apiKeySecret = connectionSettings.settings?.api_key_secret;
  const phoneNumber = connectionSettings.settings?.phone_number;

  if (!accountSid || !apiKey) {
    throw new Error("Twilio not connected - missing credentials");
  }

  cachedCredentials = { accountSid, apiKey, apiKeySecret, phoneNumber };
  console.log(`[Twilio] Connected - Phone: ${phoneNumber}`);
  return cachedCredentials;
}

export async function getTwilioClient() {
  const { accountSid, apiKey, apiKeySecret } = await getCredentials();

  if (apiKey.startsWith("SK")) {
    return twilio(apiKey, apiKeySecret, { accountSid });
  }
  return twilio(accountSid, apiKey);
}

export async function getTwilioFromPhoneNumber() {
  const { phoneNumber } = await getCredentials();
  return phoneNumber;
}

export async function sendSMS(to: string, body: string): Promise<{ success: boolean; sid?: string; error?: string }> {
  try {
    const client = await getTwilioClient();
    const fromNumber = await getTwilioFromPhoneNumber();

    if (!fromNumber) {
      return { success: false, error: "No Twilio phone number configured" };
    }

    const cleanTo = to.replace(/[^\d+]/g, "");
    const formattedTo = cleanTo.startsWith("+") ? cleanTo : `+1${cleanTo}`;

    if (cleanTo.includes("555")) {
      return { success: false, error: "Invalid phone number (test number)" };
    }

    const message = await client.messages.create({
      body,
      from: fromNumber,
      to: formattedTo,
    });

    console.log(`[Twilio] SMS sent to ${formattedTo}, SID: ${message.sid}`);
    return { success: true, sid: message.sid };
  } catch (error: any) {
    console.error(`[Twilio] SMS failed to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
}
