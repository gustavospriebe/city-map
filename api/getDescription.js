// const fetch = require('node-fetch'); // Uncomment if needed

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", ["POST"])
    return response
      .status(405)
      .json({ error: `Método ${request.method} não permitido` }) // pt-BR
  }

  if (!GEMINI_API_KEY) {
    console.error(
      "Erro de Configuração: Chave API Gemini faltando nas variáveis de ambiente.",
    ) // pt-BR Server-side log
    return response
      .status(500)
      .json({ error: "Erro de configuração interna do servidor." }) // pt-BR Generic to client
  }

  const { attractionName, displayCityName } = request.body

  if (!attractionName) {
    return response
      .status(400)
      .json({ error: "Nome da atração é obrigatório." }) // pt-BR
  }

  let prompt = `Forneça uma descrição turística concisa e envolvente (2-4 frases) em Português Brasileiro para "${attractionName}"` // pt-BR
  if (displayCityName) {
    prompt += ` localizado em ${displayCityName}. Foque na sua importância ou no que um visitante pode experienciar. Não use markdown.` // pt-BR
  } else {
    prompt += `. Foque na sua importância ou no que um visitante pode experienciar. Não use markdown.` // pt-BR
  }

  const modelName = "gemini-1.5-flash"
  const apiVersion = "v1"
  const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`
  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    safetySettings: [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
    ],
    generationConfig: { maxOutputTokens: 150 },
  }

  try {
    const geminiResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      // Note: We can't easily use the client's AbortSignal here.
      // Vercel functions have a timeout (e.g., 10s on Hobby plan).
      // If Gemini takes too long, the function will timeout.
    })

    if (!geminiResponse.ok) {
      let errorMsg = `Erro API Gemini (${modelName})! Status: ${geminiResponse.status}` //pt-BR
      let isBlocked = false
      try {
        const errorData = await geminiResponse.json()
        errorMsg = `Gemini Error: ${
          errorData.error?.message ||
          geminiResponse.statusText ||
          geminiResponse.status
        }`
        if (
          geminiResponse.status === 400 &&
          errorMsg.toLowerCase().includes("api key not valid")
        ) {
          errorMsg = "Chave API Gemini inválida ou mal configurada no servidor." // pt-BR Server-side specific
          console.error(errorMsg)
          return response
            .status(500)
            .json({ error: "Erro interno ao contatar serviço de IA." }) // pt-BR Generic to client
        }
        // Check if it was blocked due to safety settings
        isBlocked =
          errorData?.promptFeedback?.blockReason ||
          errorData?.candidates?.[0]?.finishReason === "SAFETY"
        if (isBlocked) {
          console.warn(
            `Descrição para "${attractionName}" bloqueada. Razão: ${
              errorData?.promptFeedback?.blockReason || "SAFETY"
            }`,
          ) // pt-BR Server log
          // Return specific blocked status/message to frontend
          return response
            .status(400)
            .json({
              error: "Descrição bloqueada por segurança.",
              blocked: true,
            }) // pt-BR
        }
      } catch (e) {
        /* ignore if response isn't json */
      }
      throw new Error(errorMsg) // Throw other errors
    }

    const geminiData = await geminiResponse.json()
    let generatedText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text

    if (!generatedText) {
      const finishReason = geminiData?.candidates?.[0]?.finishReason
      const blockReason = geminiData?.promptFeedback?.blockReason // Double check block reason
      if (blockReason || finishReason === "SAFETY") {
        console.warn(
          `Descrição para "${attractionName}" bloqueada (verificado novamente). Razão: ${
            blockReason || "SAFETY"
          }`,
        ) // pt-BR
        return response
          .status(400)
          .json({ error: "Descrição bloqueada por segurança.", blocked: true }) // pt-BR
      }
      if (finishReason && finishReason !== "STOP") {
        throw new Error(`Geração da descrição falhou (${finishReason}).`) // pt-BR
      }
      // If no text and no specific block/reason, treat as unavailable
      console.warn(
        `Gemini não retornou descrição para "${attractionName}", mas sem erro claro.`,
      ) // pt-BR
      generatedText = null // Explicitly set to null if no text
    }

    response
      .status(200)
      .json({ description: generatedText ? generatedText.trim() : null })
  } catch (error) {
    console.error(
      `Erro ao buscar descrição Gemini para "${attractionName}":`,
      error,
    ) // pt-BR Server log
    // Return 502 if the fetch itself failed, 500 for other processing errors
    const status = error.message.startsWith("Erro API Gemini") ? 502 : 500
    response
      .status(status)
      .json({ error: error.message || "Erro interno ao buscar descrição." }) // pt-BR
  }
}
