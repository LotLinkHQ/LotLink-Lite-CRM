import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export function isClaudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function askAboutInventory(
  question: string,
  inventoryContext: string,
  conversationHistory?: { role: "user" | "assistant"; content: string }[]
): Promise<{ answer: string; error?: string }> {
  const client = getClient();
  if (!client) {
    return {
      answer: "",
      error: "AI assistant is not configured. Set ANTHROPIC_API_KEY in your environment.",
    };
  }

  const systemPrompt = `You are an AI sales assistant for an RV dealership. You have detailed knowledge of the current inventory listed below. Help salespeople quickly find information about specific units, compare models, and answer customer questions.

Be concise, accurate, and helpful. When referencing specific units, include the stock number, year, make, model, and price. If you're not sure about something, say so rather than guessing.

Format prices with dollar signs and commas (e.g. $45,999). Use bullet points for lists of features or comparisons.

CURRENT INVENTORY:
${inventoryContext}`;

  const messages: Anthropic.MessageParam[] = [];

  if (conversationHistory?.length) {
    for (const msg of conversationHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  messages.push({ role: "user", content: question });

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const textBlock = response.content.find((block) => block.type === "text");
    return { answer: textBlock?.text ?? "No response generated." };
  } catch (err: any) {
    console.error("[Claude] API error:", err.message);
    return {
      answer: "",
      error: `AI request failed: ${err.message}`,
    };
  }
}

export interface ExtractedLeadData {
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  rvType?: string;
  preferredMake?: string;
  preferredModel?: string;
  preferredYear?: string;
  budget?: string;
  bedType?: string;
  minLength?: string;
  notes?: string;
}

export async function extractLeadFromTranscript(
  transcript: string
): Promise<{ data: ExtractedLeadData; confidence: Record<string, string>; error?: string }> {
  const client = getClient();
  if (!client) {
    return { data: {}, confidence: {}, error: "AI not configured. Set ANTHROPIC_API_KEY." };
  }

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `You are extracting structured lead data from a salesperson's voice recording transcript at an RV dealership. The salesperson just spoke with a customer on the lot and is dictating what they learned.

TRANSCRIPT:
"${transcript}"

Extract to JSON with these fields (omit any you can't extract):
{
  "data": {
    "customerName": "Full name",
    "customerPhone": "Phone (digits with dashes)",
    "customerEmail": "Email",
    "rvType": "RV type (Class A, Class B, Class C, Fifth Wheel, Travel Trailer, Toy Hauler, etc)",
    "preferredMake": "Manufacturer (Thor, Winnebago, Tiffin, etc)",
    "preferredModel": "Model name",
    "preferredYear": "Year as string",
    "budget": "Max budget as number string (e.g. '90000')",
    "budgetMin": "Min budget as number string",
    "bedType": "Bed type (King, Queen, Murphy, Bunk, etc)",
    "minLength": "Min length in feet as string",
    "amenities": ["array", "of", "features"],
    "notes": "Any other info not captured in structured fields"
  },
  "confidence": {
    "customerName": "high|medium|low",
    "customerPhone": "high|medium|low",
    ...for each extracted field
  }
}

Handle natural speech: numbers spoken as words ("ninety grand" = 90000), casual references ("Class C" = rvType), phone numbers in any format. Return ONLY valid JSON.`,
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const raw = textBlock?.text || "{}";
    const jsonStr = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(jsonStr);
    return { data: parsed.data || {}, confidence: parsed.confidence || {} };
  } catch (err: any) {
    console.error("[Claude] Voice extraction error:", err.message);
    return { data: {}, confidence: {}, error: `Extraction failed: ${err.message}` };
  }
}

export async function extractLeadUpdatesFromTranscript(
  transcript: string,
  existingLead: { customerName: string; preferences?: any; notes?: string }
): Promise<{ updates: Record<string, any>; summary: string; error?: string }> {
  const client = getClient();
  if (!client) {
    return { updates: {}, summary: "", error: "AI not configured." };
  }

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `A salesperson just recorded a voice note about an existing lead. Extract any updates.

EXISTING LEAD:
Name: ${existingLead.customerName}
Current preferences: ${JSON.stringify(existingLead.preferences || {})}
Current notes: ${existingLead.notes || "None"}

VOICE NOTE TRANSCRIPT:
"${transcript}"

Return JSON:
{
  "updates": {
    "preferences": { ...only changed/new preference fields },
    "notes": "text to APPEND to existing notes (timestamped)",
    "status": "new status if mentioned (contacted/working/etc) or null"
  },
  "summary": "Human-readable summary of changes, e.g. 'Update budget from $80K to $95K. Add feature: solar panels.'"
}

Return ONLY valid JSON.`,
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const raw = textBlock?.text || "{}";
    const jsonStr = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(jsonStr);
    return { updates: parsed.updates || {}, summary: parsed.summary || "" };
  } catch (err: any) {
    console.error("[Claude] Voice update extraction error:", err.message);
    return { updates: {}, summary: "", error: `Extraction failed: ${err.message}` };
  }
}

export async function prepareCallTalkingPoints(
  lead: { customerName: string; preferences?: any; notes?: string; preferredModel?: string },
  unit: { year: number; make: string; model: string; price?: string; amenities?: any; bedType?: string; length?: string },
  matchScore: number,
  matchReason?: string
): Promise<{ talkingPoints: string; error?: string }> {
  const client = getClient();
  if (!client) {
    return { talkingPoints: "", error: "AI not configured. Set ANTHROPIC_API_KEY." };
  }

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `You are a sales coach at an RV dealership. A salesperson is about to call a customer about a matched RV unit. Prepare concise, actionable talking points.

CUSTOMER:
Name: ${lead.customerName}
Preferences: ${JSON.stringify(lead.preferences || {})}
Notes: ${lead.notes || "None"}
Preferred Model: ${lead.preferredModel || "Not specified"}

MATCHED UNIT:
${unit.year} ${unit.make} ${unit.model}
Price: ${unit.price ? `$${Number(unit.price).toLocaleString()}` : "Call for pricing"}
Length: ${unit.length || "N/A"} ft
Bed: ${unit.bedType || "N/A"}
Features: ${JSON.stringify(unit.amenities || [])}

Match Score: ${matchScore}/100
Match Reason: ${matchReason || "N/A"}

Generate talking points in this format:
1. **Opening line** - natural, confident opener mentioning why you're calling
2. **Why this matches** - 2-3 sentences connecting their preferences to this unit
3. **Key selling points** - top 3 features to highlight
4. **Handle objections** - what they might push back on and how to respond
5. **Close** - suggested next step (appointment, test drive, etc.)

Keep it conversational, not robotic. Under 200 words total.`,
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    return { talkingPoints: textBlock?.text ?? "No response generated." };
  } catch (err: any) {
    console.error("[Claude] Call prep error:", err.message);
    return { talkingPoints: "", error: `Failed: ${err.message}` };
  }
}

export async function generateMatchExplanation(
  lead: { customerName: string; preferences?: any; preferredModel?: string; notes?: string },
  unit: { year: number; make: string; model: string; price?: string; amenities?: any; bedType?: string; length?: string },
  matchScore: number
): Promise<{ explanation: string; error?: string }> {
  const client = getClient();
  if (!client) {
    return { explanation: "", error: "AI not configured." };
  }

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `Write a brief, conversational match explanation that a salesperson can read to a customer or use internally. 2-3 sentences max.

Customer: ${lead.customerName}
Wants: ${JSON.stringify(lead.preferences || {})}
Preferred Model: ${lead.preferredModel || "None specified"}

Unit: ${unit.year} ${unit.make} ${unit.model} at ${unit.price ? `$${Number(unit.price).toLocaleString()}` : "call for pricing"}
Features: ${JSON.stringify(unit.amenities || [])}
Bed: ${unit.bedType || "N/A"}, Length: ${unit.length || "N/A"}ft

Match Score: ${matchScore}/100

Write naturally — say why it's a good fit, note any gaps honestly, suggest a next step. No bullet points, just plain conversational text.`,
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    return { explanation: textBlock?.text ?? "" };
  } catch (err: any) {
    console.error("[Claude] Match explanation error:", err.message);
    return { explanation: "", error: err.message };
  }
}

export async function extractLeadFromImage(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg"
): Promise<{ data: ExtractedLeadData; error?: string }> {
  const client = getClient();
  if (!client) {
    return { data: {}, error: "AI not configured. Set ANTHROPIC_API_KEY." };
  }

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: imageBase64 },
            },
            {
              type: "text",
              text: `Extract lead/customer information from this image. It may be handwritten notes, a business card, a printed form, or a dealer trade sheet.

Return ONLY a JSON object with these fields (omit any field you can't confidently extract):
{
  "customerName": "Full name",
  "customerPhone": "Phone number (digits only, with country code if visible)",
  "customerEmail": "Email address",
  "rvType": "Type of RV (e.g. Class A, Class C, Fifth Wheel, Travel Trailer)",
  "preferredMake": "RV manufacturer (e.g. Tiffin, Winnebago, Thor)",
  "preferredModel": "Specific model name",
  "preferredYear": "Year or year range",
  "budget": "Budget amount (digits only)",
  "bedType": "Bed type preference (e.g. King, Queen)",
  "minLength": "Minimum length in feet (digits only)",
  "notes": "Any other relevant information as free text"
}

Return ONLY valid JSON, no markdown or explanation.`,
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const raw = textBlock?.text || "{}";

    // Parse JSON - handle potential markdown wrapping
    const jsonStr = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
    const data: ExtractedLeadData = JSON.parse(jsonStr);
    return { data };
  } catch (err: any) {
    console.error("[Claude] Vision extraction error:", err.message);
    return { data: {}, error: `Extraction failed: ${err.message}` };
  }
}
