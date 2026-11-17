import { api } from "./api";
import { TranslationResult } from "../types";

const AI_PROXY_URL = "https://aiproxy.itsata.com/v1/chat/completions";
const AI_PROXY_TOKEN = "sk-cpa-atx-8e792fb14a5cd60321ea89f0714b2d9e";
const AI_PROXY_MODEL = "gemini-flash-lite";

// In-memory cache for translations in the mobile app session
const translationCache = new Map<string, TranslationResult>();

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8202;/g, "\u200A");
}

function escapeHtmlText(str: string): string {
  return str
    .replace(/&(?!amp;|lt;|gt;|quot;|#\d+;|#x[0-9a-fA-F]+;)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function extractPlainTextFromHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .trim();
}

function parseLlmJson(rawContent: string): any {
  let cleaned = rawContent.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    const subjectMatch = cleaned.match(/"subject"\s*:\s*"((?:\\.|[^"\\])*)"/);
    const detectedLangMatch = cleaned.match(/"detectedLanguage"\s*:\s*"((?:\\.|[^"\\])*)"/);
    const isEnglishMatch = cleaned.match(/"isAlreadyEnglish"\s*:\s*(true|false)/i);
    const bodyTextMatch = cleaned.match(/"bodyText"\s*:\s*"((?:\\.|[^"\\])*)"/);

    let translations: string[] = [];
    const transArrayMatch = cleaned.match(/"translations"\s*:\s*\[([\s\S]*?)\]/);
    if (transArrayMatch) {
      try {
        translations = JSON.parse(`[${transArrayMatch[1]}]`);
      } catch {
        const itemMatches = transArrayMatch[1].matchAll(/"((?:\\.|[^"\\])*)"/g);
        translations = Array.from(itemMatches, (m) => {
          try {
            return JSON.parse(`"${m[1]}"`);
          } catch {
            return m[1];
          }
        });
      }
    }

    return {
      subject: subjectMatch ? JSON.parse(`"${subjectMatch[1]}"`) : undefined,
      bodyHtml: null,
      bodyText: bodyTextMatch ? JSON.parse(`"${bodyTextMatch[1]}"`) : undefined,
      detectedLanguage: detectedLangMatch ? detectedLangMatch[1] : "Unknown",
      isAlreadyEnglish: isEnglishMatch ? isEnglishMatch[1].toLowerCase() === "true" : false,
      translations: translations.length > 0 ? translations : undefined,
    };
  }
}

async function callDirectAiProxy(messages: Array<{ role: string; content: string }>): Promise<any> {
  const response = await fetch(AI_PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AI_PROXY_TOKEN}`,
      "Accept-Encoding": "identity",
    },
    body: JSON.stringify({
      model: AI_PROXY_MODEL,
      messages,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI Proxy translation error (${response.status}): ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error("AI Proxy returned empty response");
  }

  return parseLlmJson(rawContent);
}

/**
 * Direct client fallback using aiproxy.itsata.com in case backend route is unavailable.
 * Preserves exact HTML layout, tables, styles, and images.
 */
async function translateDirectWithAiProxy(
  subject: string,
  bodyHtml: string | null,
  bodyText: string | null,
  targetLanguage: string = "English",
): Promise<TranslationResult> {
  const rawSubject = (subject || "").trim();

  // -------------------------------------------------------------
  // Case A: Rich HTML Email -> Layout Preserving
  // -------------------------------------------------------------
  if (bodyHtml && bodyHtml.trim()) {
    const TAG_AND_SPECIAL_REGEX = /(<!--[\s\S]*?-->|<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<noscript[\s\S]*?<\/noscript>|<svg[\s\S]*?<\/svg>|<[^>]+>)/gi;

    const parts: Array<{ type: "tag" | "text"; content: string }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = TAG_AND_SPECIAL_REGEX.exec(bodyHtml)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: "text", content: bodyHtml.slice(lastIndex, match.index) });
      }
      parts.push({ type: "tag", content: match[0] });
      lastIndex = TAG_AND_SPECIAL_REGEX.lastIndex;
    }
    if (lastIndex < bodyHtml.length) {
      parts.push({ type: "text", content: bodyHtml.slice(lastIndex) });
    }

    interface TextNodeItem {
      partIndex: number;
      leading: string;
      trailing: string;
      text: string;
    }

    const textItems: TextNodeItem[] = [];
    parts.forEach((p, idx) => {
      if (p.type === "text") {
        const raw = p.content;
        const leading = (raw.match(/^\s*/) || [""])[0];
        const trailing = (raw.match(/\s*$/) || [""])[0];
        const core = raw.slice(leading.length, raw.length - trailing.length);
        if (!core) return;
        const unescaped = decodeHtmlEntities(core);
        if (/\p{L}/u.test(unescaped)) {
          textItems.push({ partIndex: idx, leading, trailing, text: unescaped });
        }
      }
    });

    const uniqueTexts = Array.from(new Set([
      ...(bodyText && /\p{L}/u.test(bodyText) ? [bodyText] : []),
      ...textItems.map((t) => t.text),
    ]));

    if (uniqueTexts.length === 0) {
      return {
        subject: rawSubject,
        bodyHtml,
        bodyText,
        detectedLanguage: "Unknown",
        isAlreadyEnglish: true,
        model: AI_PROXY_MODEL,
      };
    }

    const BATCH_SIZE = 45;
    const batches: string[][] = [];
    for (let i = 0; i < uniqueTexts.length; i += BATCH_SIZE) {
      batches.push(uniqueTexts.slice(i, i + BATCH_SIZE));
    }

    const batch1Promise = callDirectAiProxy([
      {
        role: "system",
        content: `You are a professional email translation engine.
Translate the provided email subject and array of text snippets into ${targetLanguage}.
Guidelines:
1. Preserve all brand names, product codes, tracking numbers, dates, monetary amounts, and placeholders accurately.
2. Maintain natural phrasing, capitalization, and punctuation.
3. If the content is already in ${targetLanguage}, return it unchanged and set "isAlreadyEnglish": true.
4. Detect the source language and set "detectedLanguage".
5. Return ONLY a valid JSON object:
{
  "subject": "string",
  "detectedLanguage": "string",
  "isAlreadyEnglish": boolean,
  "translations": ["string"]
}
CRITICAL: The "translations" array MUST contain EXACTLY the same number of items (${batches[0].length}) in the EXACT same order as the input "texts" array.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          subject: rawSubject,
          texts: batches[0],
        }),
      },
    ]);

    const subsequentBatchPromises = batches.slice(1).map((batchTexts) =>
      callDirectAiProxy([
        {
          role: "system",
          content: `You are a professional translation engine.
Translate the provided array of text snippets into ${targetLanguage}.
Return ONLY a valid JSON object:
{
  "translations": ["string"]
}
CRITICAL: The "translations" array MUST contain EXACTLY the same number of items (${batchTexts.length}) in the EXACT same order as the input "texts" array.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            texts: batchTexts,
          }),
        },
      ]),
    );

    const [batch1Result, ...subsequentResults] = await Promise.all([
      batch1Promise,
      ...subsequentBatchPromises,
    ]);

    if (batch1Result.isAlreadyEnglish) {
      return {
        subject: rawSubject,
        bodyHtml,
        bodyText,
        detectedLanguage: batch1Result.detectedLanguage || targetLanguage,
        isAlreadyEnglish: true,
        model: AI_PROXY_MODEL,
      };
    }

    const allTranslations: string[] = [...(batch1Result.translations || [])];
    for (const sub of subsequentResults) {
      if (Array.isArray(sub?.translations)) {
        allTranslations.push(...sub.translations);
      }
    }

    const translationMap = new Map<string, string>();
    uniqueTexts.forEach((origText, idx) => {
      translationMap.set(origText, allTranslations[idx] || origText);
    });

    for (const item of textItems) {
      const translated = translationMap.get(item.text) || item.text;
      const escaped = escapeHtmlText(translated);
      parts[item.partIndex].content = item.leading + escaped + item.trailing;
    }

    const finalBodyHtml = parts.map((p) => p.content).join("");
    const finalBodyText = (bodyText && translationMap.get(bodyText)) || extractPlainTextFromHtml(finalBodyHtml);

    return {
      subject: batch1Result.subject || rawSubject,
      bodyHtml: finalBodyHtml,
      bodyText: finalBodyText || bodyText,
      detectedLanguage: batch1Result.detectedLanguage || "Unknown",
      isAlreadyEnglish: Boolean(batch1Result.isAlreadyEnglish),
      model: AI_PROXY_MODEL,
    };
  }

  // -------------------------------------------------------------
  // Case B: Plain-text Email
  // -------------------------------------------------------------
  let textToTranslate = bodyText || "";
  if (textToTranslate.length > 25000) {
    textToTranslate = textToTranslate.slice(0, 25000) + "\n\n... [Content truncated for translation]";
  }

  const systemPrompt = `You are an expert multilingual email translation engine.
Translate the provided email subject and text into ${targetLanguage}.
Guidelines:
1. Translate "bodyText" preserving natural paragraphs, bullet lists, and line breaks.
2. Translate "subject" accurately.
3. If already in ${targetLanguage}, return unchanged and set "isAlreadyEnglish": true.
4. Detect the source language and set "detectedLanguage".
5. Respond ONLY with a valid JSON object matching this schema:
{
  "subject": "string",
  "bodyText": "string",
  "detectedLanguage": "string",
  "isAlreadyEnglish": boolean
}`;

  const parsed = await callDirectAiProxy([
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: JSON.stringify({
        subject: rawSubject,
        bodyText: textToTranslate,
      }),
    },
  ]);

  return {
    subject: parsed.subject || rawSubject,
    bodyHtml: null,
    bodyText: parsed.bodyText || textToTranslate,
    detectedLanguage: parsed.detectedLanguage || "Unknown",
    isAlreadyEnglish: Boolean(parsed.isAlreadyEnglish),
    model: AI_PROXY_MODEL,
  };
}

export async function translateEmailMessage(
  message: {
    id: string;
    subject?: string | null;
    bodyHtml?: string | null;
    bodyText?: string | null;
  },
  targetLanguage: string = "English",
): Promise<TranslationResult> {
  const cacheKey = `${message.id}::${targetLanguage}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey)!;
  }

  // 1. Try server endpoint first
  try {
    const serverRes = await api.messages.translate(message.id, targetLanguage);
    if (serverRes?.translated) {
      translationCache.set(cacheKey, serverRes.translated);
      return serverRes.translated;
    }
  } catch (serverErr: any) {
    console.warn("Server translation endpoint failed, falling back to direct AI Proxy:", serverErr?.message);
  }

  // 2. Fall back to direct AI Proxy call
  const directResult = await translateDirectWithAiProxy(
    message.subject || "",
    message.bodyHtml || null,
    message.bodyText || null,
    targetLanguage,
  );

  translationCache.set(cacheKey, directResult);
  return directResult;
}
