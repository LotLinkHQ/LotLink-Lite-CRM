import sgMail from "@sendgrid/mail";

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error("X_REPLIT_TOKEN not found for repl/depl");
  }

  const connUrl =
    "https://" +
    hostname +
    "/api/v2/connection?include_secrets=true&connector_names=sendgrid";
  const connRes = await fetch(connUrl, {
    headers: {
      Accept: "application/json",
      X_REPLIT_TOKEN: xReplitToken,
    },
  });
  const connData = await connRes.json();
  const connectionSettings = connData.items?.[0];

  if (
    !connectionSettings ||
    !connectionSettings.settings?.api_key ||
    !connectionSettings.settings?.from_email
  ) {
    throw new Error("SendGrid not connected");
  }

  return {
    apiKey: connectionSettings.settings.api_key,
    fromEmail: connectionSettings.settings.from_email,
  };
}

async function getSendGridClient() {
  const { apiKey, fromEmail } = await getCredentials();
  sgMail.setApiKey(apiKey);
  return { client: sgMail, fromEmail };
}

function buildManagerEmailHtml(lead: any, unit: any, score: number, reasons: string[]): string {
  const unitName = `${unit.year} ${unit.make} ${unit.model}`;
  const priceStr = unit.price
    ? `$${parseFloat(unit.price).toLocaleString()}`
    : "Contact for pricing";
  const locationStr = unit.storeLocation || "your dealership";

  const reasonsList = reasons
    .map((r) => `<li style="margin-bottom: 4px;">${r}</li>`)
    .join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background-color:#f4f4f4; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4; padding: 20px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:8px; overflow:hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <tr>
          <td style="background: linear-gradient(135deg, #0B5E7E, #1e3a5f); padding: 30px 40px; text-align:center;">
            <h1 style="color:#ffffff; margin:0; font-size:24px;">New Lead Match Found!</h1>
            <p style="color:#b8d4e8; margin:8px 0 0; font-size:16px;">Sales Manager Alert: ${lead.customerName} matches a new unit.</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 30px 40px;">
            <div style="background-color:#f0f7ff; border-radius:8px; padding:20px; margin-bottom:20px; border-left: 4px solid #0B5E7E;">
              <h2 style="margin:0 0 8px; color:#1e3a5f; font-size:20px;">Matched Unit: ${unitName}</h2>
              <p style="margin:4px 0; color:#555; font-size:16px;"><strong>Price:</strong> ${priceStr}</p>
              <p style="margin:4px 0; color:#555; font-size:16px;"><strong>Location:</strong> ${locationStr}</p>
            </div>

            <div style="background-color:#fff9f0; border-radius:8px; padding:20px; margin-bottom:20px; border-left: 4px solid #F39C12;">
              <h3 style="margin:0 0 8px; color:#1e3a5f; font-size:18px;">Customer Information</h3>
              <p style="margin:4px 0; color:#555; font-size:16px;"><strong>Name:</strong> ${lead.customerName}</p>
              <p style="margin:4px 0; color:#555; font-size:16px;"><strong>Email:</strong> ${lead.customerEmail || "N/A"}</p>
              <p style="margin:4px 0; color:#555; font-size:16px;"><strong>Phone:</strong> ${lead.customerPhone || "N/A"}</p>
              <p style="margin:4px 0; color:#555; font-size:16px;"><strong>Match Score:</strong> ${score}/100</p>
            </div>

            <h3 style="color:#1e3a5f; margin:20px 0 10px;">Why This is a Strong Match</h3>
            <ul style="color:#555; padding-left:20px; font-size:14px; line-height:1.6;">
              ${reasonsList}
            </ul>
            <div style="text-align:center; margin:30px 0 10px;">
              <p style="color:#555; font-size:16px; margin-bottom:15px;">Follow up with this lead as soon as possible!</p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background-color:#f8f8f8; padding:20px 40px; text-align:center; border-top:1px solid #eee;">
            <p style="color:#999; font-size:12px; margin:0;">Internal Dealer Alert - LotLink RV Mini CRM</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildManagerEmailText(lead: any, unit: any, score: number, reasons: string[]): string {
  const unitName = `${unit.year} ${unit.make} ${unit.model}`;
  const priceStr = unit.price
    ? `$${parseFloat(unit.price).toLocaleString()}`
    : "Contact for pricing";
  const locationStr = unit.storeLocation || "your dealership";

  return (
    `INTERNAL ALERT: New Lead Match Found!\n\n` +
    `Lead: ${lead.customerName}\n` +
    `Email: ${lead.customerEmail || "N/A"}\n` +
    `Phone: ${lead.customerPhone || "N/A"}\n` +
    `Match Score: ${score}/100\n\n` +
    `Matched Unit: ${unitName}\n` +
    `Price: ${priceStr}\n` +
    `Location: ${locationStr}\n\n` +
    `Why this is a strong match:\n` +
    reasons.map((r) => `  - ${r}`).join("\n") +
    `\n\nFollow up with this lead as soon as possible!`
  );
}

export async function sendEmail(
  to: string,
  lead: any,
  unit: any,
  score: number,
  reasons: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const { client, fromEmail } = await getSendGridClient();

    const unitName = `${unit.year} ${unit.make} ${unit.model}`;

    const msg = {
      to,
      from: fromEmail,
      subject: `📢 New Match Found: ${lead.customerName} — ${unitName}`,
      text: buildManagerEmailText(lead, unit, score, reasons),
      html: buildManagerEmailHtml(lead, unit, score, reasons),
    };

    await client.send(msg);
    console.log(`[SendGrid] Email sent to ${to}`);
    return { success: true };
  } catch (error: any) {
    const errorMsg = error?.response?.body?.errors?.[0]?.message || error.message;
    console.error(`[SendGrid] Email failed to ${to}:`, errorMsg);
    return { success: false, error: errorMsg };
  }
}
