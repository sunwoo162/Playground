"use strict";

const originalFetch = globalThis.fetch?.bind(globalThis);

if (originalFetch) {
  globalThis.fetch = async function bloomLocalStructuredFetch(input, init = {}) {
    if (typeof init.body !== "string") return originalFetch(input, init);

    let payload;
    try {
      payload = JSON.parse(init.body);
    } catch {
      return originalFetch(input, init);
    }

    if (!payload || !Array.isArray(payload.messages) || payload.response_format) {
      return originalFetch(input, init);
    }

    const systemMessage = payload.messages.find((message) => message?.role === "system");
    const systemText = typeof systemMessage?.content === "string" ? systemMessage.content : "";
    const marker = "Required JSON Schema:\n";
    const markerIndex = systemText.indexOf(marker);

    if (markerIndex >= 0) {
      const schemaText = systemText.slice(markerIndex + marker.length).trim();
      try {
        payload.response_format = {
          type: "json_object",
          schema: JSON.parse(schemaText),
        };
      } catch {
        payload.response_format = { type: "json_object" };
      }
    } else {
      payload.response_format = { type: "json_object" };
    }

    return originalFetch(input, {
      ...init,
      body: JSON.stringify(payload),
    });
  };
}
