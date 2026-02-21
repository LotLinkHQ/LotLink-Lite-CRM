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
