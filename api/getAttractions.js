// Use fetch globally available in modern Node.js/Vercel environment
// const fetch = require('node-fetch'); // Uncomment if needed in older environments

// Access environment variables securely
const GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY
const GEMINI_API_KEY = process.env.GEMINI_API_KEY

// Helper function for Geoapify Geocoding
async function geocodeAttraction(attractionName, cityName, cityLat, cityLon) {
  if (!GEOAPIFY_API_KEY) {
    throw new Error("Chave API Geoapify não configurada no servidor.") // pt-BR Server-side error
  }

  const searchText = `${attractionName}, ${cityName}` // Use city name for context
  let filterParam = ""
  const searchRadiusMeters = 30000 // 30km

  if (cityLon && cityLat) {
    filterParam = `&filter=circle:${cityLon},${cityLat},${searchRadiusMeters}`
  }

  const langParam = "&lang=pt"
  const geocodeUrl = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(
    searchText,
  )}&limit=1${filterParam}${langParam}&apiKey=${GEOAPIFY_API_KEY}`

  try {
    const response = await fetch(geocodeUrl)
    if (!response.ok) {
      // Provide more specific feedback for common errors
      if (response.status === 401) {
        throw new Error("Chave API Geoapify inválida ou não autorizada.") // pt-BR
      }
      throw new Error(`Erro API Geoapify (${response.status})`)
    }
    const data = await response.json()
    if (data?.features?.length > 0) {
      const feature = data.features[0]
      // Ensure coordinates are valid numbers before returning
      if (
        typeof feature.properties?.lat === "number" &&
        typeof feature.properties?.lon === "number"
      ) {
        feature.properties.original_name = attractionName // Keep track of the name Gemini gave
        if (!feature.properties.name) {
          feature.properties.name = attractionName // Use original if Geoapify lacks one
        }
        return feature // Return the full GeoJSON feature
      }
    }
    return null // No valid result found
  } catch (error) {
    console.error(`Erro ao geocodificar "${attractionName}":`, error.message) // pt-BR Log server-side
    // Don't throw here, allow Promise.allSettled to handle it, just return null
    return null
  }
}

// Main Vercel serverless function handler
export default async function handler(request, response) {
  // Only allow POST requests
  if (request.method !== "POST") {
    response.setHeader("Allow", ["POST"])
    return response
      .status(405)
      .json({ error: `Método ${request.method} não permitido` }) // pt-BR
  }

  // Check for required API keys on the server
  if (!GEMINI_API_KEY || !GEOAPIFY_API_KEY) {
    console.error(
      "Erro de Configuração: Chaves API Geoapify ou Gemini faltando nas variáveis de ambiente.",
    ) // pt-BR
    return response
      .status(500)
      .json({ error: "Erro de configuração interna do servidor." }) // pt-BR Generic message to client
  }

  const { displayCityName, cityLat, cityLon } = request.body

  if (!displayCityName) {
    return response.status(400).json({ error: "Nome da cidade é obrigatório." }) // pt-BR
  }

  let attractionNames = []

  // --- Step 1: Get Attraction Names from Gemini ---
  const geminiPrompt = `Liste as 10 atrações turísticas ou pontos de interesse mais famosos e distintos especificamente na cidade de ${displayCityName}. Forneça apenas os nomes, cada um em uma nova linha. Não inclua números, descrições ou endereços. Certifique-se de que os nomes sejam de locais ou marcos reconhecíveis. Responda em Português Brasileiro.` // pt-BR
  const geminiModel = "gemini-1.5-flash"
  const geminiApiVersion = "v1"
  const geminiUrl = `https://generativelanguage.googleapis.com/${geminiApiVersion}/models/${geminiModel}:generateContent?key=${GEMINI_API_KEY}`
  const geminiRequestBody = {
    contents: [{ parts: [{ text: geminiPrompt }] }],
    generationConfig: { maxOutputTokens: 200, temperature: 0.4 },
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
  }

  try {
    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiRequestBody),
    })

    if (!geminiResponse.ok) {
      let errorMsg = `Erro API Gemini (${geminiModel})! Status: ${geminiResponse.status}` // pt-BR
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
          console.error(errorMsg) // Log sensitive config error server-side only
          // Return generic error to client
          return response
            .status(500)
            .json({ error: "Erro interno ao contatar serviço de IA." }) // pt-BR
        }
      } catch (e) {
        /* ignore if response isn't json */
      }
      throw new Error(errorMsg) // Throw other Gemini errors
    }

    const geminiData = await geminiResponse.json()
    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text

    if (text) {
      attractionNames = text
        .split("\n")
        .map((name) => name.trim().replace(/^- /, ""))
        .filter(Boolean)
    } else {
      const blockReason = geminiData?.promptFeedback?.blockReason
      if (blockReason) {
        console.warn(
          `Gemini bloqueou a geração da lista para ${displayCityName}: ${blockReason}`,
        ) // Log block reason server-side
        // Let the flow continue, might result in empty list displayed nicely
      } else {
        console.warn(
          `Gemini não retornou nomes para ${displayCityName}. Resposta:`,
          JSON.stringify(geminiData),
        ) // pt-BR
      }
      // Allow execution to continue, will result in empty geocoding list
    }
  } catch (error) {
    console.error("Erro ao buscar nomes do Gemini:", error) // pt-BR Server-side log
    // Return a 502 Bad Gateway if call to Gemini failed
    return response
      .status(502)
      .json({
        error: `Falha ao obter lista de atrações da IA: ${error.message}`,
      }) // pt-BR Send error message
  }

  // --- Step 2: Geocode Attraction Names ---
  if (attractionNames.length === 0) {
    console.log(
      `Nenhum nome de atração retornado pelo Gemini para ${displayCityName}. Retornando lista vazia.`,
    ) // pt-BR
    return response.status(200).json({ attractions: [] }) // Return empty list if Gemini gave nothing
  }

  console.log(
    `Geocodificando ${attractionNames.length} nomes para ${displayCityName}...`,
  ) // pt-BR
  const geocodePromises = attractionNames.map(
    (name) => geocodeAttraction(name, displayCityName, cityLat, cityLon), // Pass coords for filtering
  )

  // Wait for all geocoding attempts to settle (succeed or fail)
  const geocodeResults = await Promise.allSettled(geocodePromises)

  const successfullyGeocodedAttractions = []
  geocodeResults.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value) {
      successfullyGeocodedAttractions.push(result.value) // Add the GeoJSON feature object
    } else {
      // Log failed geocoding attempts server-side for debugging
      console.warn(
        `Falha ao geocodificar "${attractionNames[index]}": ${
          result.reason?.message || "Sem resultado válido"
        }`,
      ) // pt-BR
    }
  })

  console.log(
    `Geocodificados com sucesso: ${successfullyGeocodedAttractions.length}/${attractionNames.length} para ${displayCityName}`,
  ) // pt-BR

  // --- Step 3: Send Response ---
  // Send the array of successfully geocoded GeoJSON features
  response.status(200).json({ attractions: successfullyGeocodedAttractions })
}
