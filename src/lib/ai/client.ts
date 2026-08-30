export interface AiExtractParams {
  url?: string;
  imageBase64?: string;
  imageMimeType?: string;
  /** Raw text context (e.g. an email body) appended verbatim to the prompt. */
  text?: string;
  prompt: string;
}

export interface AiClient {
  extractData<T>(params: AiExtractParams): Promise<T>;
}

export class GeminiClient implements AiClient {
  private apiKey: string;
  // Use a modern model version (gemini-1.5-flash is deprecated as of 2026)
  private model: string = import.meta.env?.VITE_GEMINI_MODEL || 'gemini-2.5-flash';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async extractData<T>({ url, imageBase64, imageMimeType, text, prompt }: AiExtractParams): Promise<T> {
    let textContext = '';

    if (text) {
      // Raw text (e.g. an email body) — no fetch, just truncate defensively.
      textContext = text.slice(0, 100000);
    }

    if (url) {
      try {
        // Use a CORS proxy to fetch the HTML content
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
        const data = await res.json() as { contents?: string };
        if (data.contents) {
          // Strip out obvious noise (scripts, styles) to keep the payload small
          textContext = data.contents
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ') // Strip remaining HTML tags
            .replace(/\s+/g, ' ') // Collapse whitespace
            .slice(0, 100000); // Truncate to avoid massive payloads (Gemini can handle a lot, but this is safe)
        }
      } catch (err) {
        console.warn('Failed to fetch URL context', err);
        // We will still send the prompt to Gemini; it might infer info just from the URL slug itself.
      }
    }

    const contents: Record<string, unknown>[] = [];
    const parts: Record<string, unknown>[] = [];

    // The core instructions
    parts.push({
      text: prompt + (textContext ? `\n\nWebsite content context:\n${textContext}` : ''),
    });

    if (imageBase64 && imageMimeType) {
      parts.push({
        inlineData: {
          mimeType: imageMimeType,
          data: imageBase64,
        },
      });
    }

    contents.push({ parts });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${err}`);
    }

    const data = await response.json() as Record<string, unknown>;
    const candidates = data.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
    const textResponse = candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!textResponse) {
      throw new Error('Gemini API returned an empty response');
    }

    try {
      return JSON.parse(textResponse) as T;
    } catch {
      throw new Error('Failed to parse Gemini JSON response: ' + (textResponse ?? 'empty'));
    }
  }
}
