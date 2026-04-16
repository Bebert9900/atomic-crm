import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { AuthMiddleware } from "../_shared/authentication.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse } from "../_shared/utils.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return createErrorResponse(405, "Method not allowed");
  }

  const { recording_id } = await req.json();
  if (!recording_id) {
    return createErrorResponse(400, "recording_id is required");
  }

  // Get the recording record
  const { data: recording, error: fetchError } = await supabaseAdmin
    .from("contact_recordings")
    .select("*")
    .eq("id", recording_id)
    .single();

  if (fetchError || !recording) {
    return createErrorResponse(404, "Recording not found");
  }

  // Update status to processing
  await supabaseAdmin
    .from("contact_recordings")
    .update({ transcription_status: "processing" })
    .eq("id", recording_id);

  try {
    // Download audio from storage
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from("attachments")
      .download(recording.storage_path);

    if (downloadError || !fileData) {
      throw new Error("Failed to download recording");
    }

    // Convert to base64
    const arrayBuffer = await fileData.arrayBuffer();
    const base64Audio = btoa(
      String.fromCharCode(...new Uint8Array(arrayBuffer)),
    );

    // Call Gemini API for transcription
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: "audio/webm",
                    data: base64Audio,
                  },
                },
                {
                  text: "Transcribe this audio recording accurately. If the conversation is in French, transcribe in French. Return only the transcription text, no additional commentary.",
                },
              ],
            },
          ],
        }),
      },
    );

    if (!geminiResponse.ok) {
      const errorBody = await geminiResponse.text();
      console.error("Gemini API error:", errorBody);
      throw new Error("Gemini API transcription failed");
    }

    const geminiResult = await geminiResponse.json();
    const transcription =
      geminiResult.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Second Gemini call: generate summary + advice
    let summary = "";
    let email_advice = "";
    let sms_advice = "";

    if (transcription) {
      const summaryResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Tu es un assistant commercial expert en cold calling. Voici la transcription d'un appel téléphonique avec un prospect:

---
${transcription}
---

Réponds STRICTEMENT en JSON valide avec cette structure exacte (sans markdown, sans backticks):
{
  "summary": "Un résumé concis de l'appel en 3-5 phrases (points clés, besoins du prospect, objections, prochaines étapes)",
  "email_advice": "Un conseil détaillé pour rédiger un email de suivi (ton, contenu à inclure, accroche suggérée, call-to-action)",
  "sms_advice": "Un conseil détaillé pour rédiger un SMS de suivi (court, percutant, exemple de message)"
}

Réponds uniquement avec le JSON, rien d'autre.`,
                  },
                ],
              },
            ],
          }),
        },
      );

      if (summaryResponse.ok) {
        const summaryResult = await summaryResponse.json();
        let text =
          summaryResult.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        // Strip potential markdown code fences
        text = text
          .replace(/```json\s*/g, "")
          .replace(/```\s*/g, "")
          .trim();
        try {
          const parsed = JSON.parse(text);
          summary = parsed.summary ?? "";
          email_advice = parsed.email_advice ?? "";
          sms_advice = parsed.sms_advice ?? "";
        } catch (e) {
          console.error("Failed to parse summary JSON:", text, e);
          summary = text;
        }
      } else {
        console.error(
          "Summary Gemini call failed:",
          await summaryResponse.text(),
        );
      }
    }

    // Save transcription + summary + advice
    await supabaseAdmin
      .from("contact_recordings")
      .update({
        transcription,
        transcription_status: "completed",
        summary,
        email_advice,
        sms_advice,
      })
      .eq("id", recording_id);

    return new Response(
      JSON.stringify({
        success: true,
        transcription,
        summary,
        email_advice,
        sms_advice,
      }),
      {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (error) {
    console.error("Transcription error:", error);

    await supabaseAdmin
      .from("contact_recordings")
      .update({ transcription_status: "error" })
      .eq("id", recording_id);

    return createErrorResponse(
      500,
      error instanceof Error ? error.message : "Transcription failed",
    );
  }
}

Deno.serve((req) =>
  OptionsMiddleware(req, (req) => AuthMiddleware(req, handler)),
);
