import { api } from "./api";
import { TranslationResult } from "../types";

const AI_PROXY_URL = "https://aiproxy.itsata.com/v1/chat/completions";
const AI_PROXY_TOKEN = "sk-cpa-atx-8e792fb14a5cd60321ea89f0714b2d9e";
const AI_PROXY_MODEL = "gemini-flash-lite";

// In-memory cache for translations in the mobile app session
const translationCache = new Map<string, TranslationResult>();

function isolateDataUris(html: string): {
  sanitizedHtml: string;
  restore: (translated: string) => string;
} {
  const placeholders: string[] = [];
  const sanitizedHtml = html.replace(/src=["']data:image\/[^"']+["']/gi, (match) => {
    const idx = placeholders.length;
    placeholders.push(match);
    return `src="__OMNI_IMG_PH_${idx}__"`;
  });

  const restore = (translatedHtml: string): string => {
    let restored = translatedHtml;
    placeholders.forEach((origMatch, idx) => {
      restored = restored.replaceAll(`__OMNI_IMG_PH_${idx}__`, origMatch.slice(5, -1));
    });
    return restored;
  };

  return { sanitizedHtml, restore };
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
  return JSON.parse(cleaned);
}

/**
 * Direct client fallback using aiproxy.itsata.com in case backend route is unavailable
 */
async function translateDirectWithAiProxy(
  subject: string,
  bodyHtml: string | null,
  bodyText: string | null,
  targetLanguage: string = "English",
): Promise<TranslationResult> {
  let processedHtml = bodyHtml;
  let restoreHtmlImages: ((str: string) => string) | null = null;

  if (processedHtml) {
    const { sanitizedHtml, restore } = isolateDataUris(processedHtml);
    processedHtml = sanitizedHtml;
    restoreHtmlImages = restore;

    if (processedHtml.length > 70000) {
      processedHtml = processedHtml.slice(0, 70000) + "... [truncated]";
    }
  }

  const systemPrompt = `You are an expert multilingual email translation engine.
Translate the provided email content into ${targetLanguage}.
Guidelines:
1. If "bodyHtml" is provided, translate ONLY the user-visible human language text. You MUST preserve all HTML tags, structure, classes, attributes, inline styles, and links (<a href="...">) exactly as they are.
2. If "bodyText" is provided, translate it preserving natural paragraphs, bullet lists, and line breaks.
3. Translate the "subject" line accurately.
4. If the email is already in ${targetLanguage}, return it unchanged and set "isAlreadyEnglish": true.
5. Detect the source language and set "detectedLanguage" (e.g. "French", "German", "Spanish", "Japanese", "Turkish", "English").
6. Respond ONLY with a valid JSON object matching this schema:
{
  "subject": "string",
  "bodyHtml": "string or null",
  "bodyText": "string or null",
  "detectedLanguage": "string",
  "isAlreadyEnglish": boolean
}`;

  const payload = JSON.stringify({
    subject: subject.trim(),
    bodyHtml: processedHtml,
    bodyText: bodyText ? (bodyText.length > 40000 ? bodyText.slice(0, 40000) : bodyText) : null,
  });

  const response = await fetch(AI_PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AI_PROXY_TOKEN}`,
    },
    body: JSON.stringify({
      model: AI_PROXY_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: payload },
      ],
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

  const parsed = parseLlmJson(rawContent);
  let finalHtml = parsed.bodyHtml || null;
  if (finalHtml && restoreHtmlImages) {
    finalHtml = restoreHtmlImages(finalHtml);
  }

  return {
    subject: parsed.subject || subject,
    bodyHtml: finalHtml || (parsed.bodyText ? null : bodyHtml),
    bodyText: parsed.bodyText || null,
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
