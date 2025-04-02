// Wait for the DOM to be fully loaded
document.addEventListener("DOMContentLoaded", () => {
  // --- DOM Elements (Existing) ---
  const citySelector = document.getElementById("citySelector")
  const attractionsListElement = document.getElementById("attractionsList")
  const attractionsLoader = document.getElementById("attractionsLoader")
  const attractionsPlaceholder = document.getElementById(
    "attractionsPlaceholder",
  )
  const attractionsErrorElement = document.getElementById("attractionsError")
  const mapElement = document.getElementById("map")
  const sidebar = document.getElementById("sidebar")
  const resizer = document.getElementById("resizer")
  const mapContainer = document.getElementById("map-container")
  const detailsContainer = document.getElementById("attractionDetailsContainer")
  const detailName = document.getElementById("detailName")
  const detailAddress = document.getElementById("detailAddress")
  const detailCategoriesContainer = document.getElementById(
    "detailCategoriesContainer",
  )
  const detailDescriptionElement = document.getElementById("detailDescription")
  const detailDescriptionLoader = document.getElementById(
    "detailDescriptionLoader",
  )
  const detailDescriptionError = document.getElementById(
    "detailDescriptionError",
  )

  // --- API Keys (Existing) ---
  // !! SECURITY WARNING !!
  // !!! REPLACE KEYS !!!
  const GEOAPIFY_API_KEY = "19bafcedd1324518aa981becde27c6fe"
  const GEMINI_API_KEY = "AIzaSyAKwikSjZc1iNdlM9QHaAZC5ofKGKvfwXc"

  // --- State Variables (Existing) ---
  let map = null
  let currentAttractionMarker = null
  let selectedListItem = null
  let currentGeminiRequestController = null
  let currentWikimediaRequestController = null

  // --- Resizer State (Existing) ---
  let isResizing = false
  let startX, startWidth

  // --- Initialization (Existing) ---
  function initializeApp() {
    if (!mapElement) {
      console.error("Elemento container do mapa (#map) não encontrado!")
      return
    } // pt-BR
    map = L.map(mapElement).setView([20, 0], 2)
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    if (citySelector) {
      citySelector.addEventListener("change", handleCitySelection)
    } else {
      console.error(
        "Elemento seletor de cidade (#citySelector) não encontrado!",
      )
    } // pt-BR
    initializeResizer()
    resetAttractionsUI()
  }
  function initializeResizer() {
    if (!resizer || !sidebar || !mapContainer) {
      console.error("Elementos do redimensionador não encontrados.")
      return
    } // pt-BR
    resizer.addEventListener("mousedown", (e) => {
      /* ... */
    })
    function handleMouseMove(e) {
      /* ... */
    }
    function handleMouseUp() {
      /* ... */
    }
    // Full resizer logic
    resizer.addEventListener("mousedown", (e) => {
      isResizing = true
      startX = e.clientX
      startWidth = sidebar.offsetWidth
      document.body.classList.add("resizing")
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    })
    function handleMouseMove(e) {
      if (!isResizing) return
      const dx = e.clientX - startX
      let newWidth = startWidth + dx
      const minW = parseInt(getComputedStyle(sidebar).minWidth, 10) || 200
      const maxW = parseInt(getComputedStyle(sidebar).maxWidth, 10) || 600
      newWidth = Math.max(minW, Math.min(newWidth, maxW))
      sidebar.style.width = `${newWidth}px`
      if (map) map.invalidateSize()
    }
    function handleMouseUp() {
      if (isResizing) {
        isResizing = false
        document.body.classList.remove("resizing")
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
        if (map) map.invalidateSize()
      }
    }
  }

  // --- Handle City Selection Change (Existing) ---
  function handleCitySelection() {
    const selectedOption = citySelector.options[citySelector.selectedIndex]
    const cityName = selectedOption.value
    const displayCityName = selectedOption.text
    resetAttractionsUI()
    clearAttractionMarker()
    if (cityName) {
      const lat = selectedOption.getAttribute("data-lat")
      const lon = selectedOption.getAttribute("data-lon")
      if (lat && lon && map) {
        map.flyTo([parseFloat(lat), parseFloat(lon)], 11)
      } else if (map) {
        map.setView([20, 0], 2)
      }
      fetchAttractions(cityName, displayCityName)
    }
  }

  // --- Fetch Attractions (Using gemini-1.5-flash) ---
  async function fetchAttractions(cityName, displayCityName) {
    if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_GEMINI_API_KEY") {
      displayAttractionError("Chave da API Gemini faltando ou inválida.")
      return
    } // pt-BR
    if (!GEOAPIFY_API_KEY || GEOAPIFY_API_KEY === "YOUR_GEOAPIFY_API_KEY") {
      displayAttractionError(
        "Chave da API Geoapify faltando ou inválida (necessária para geocodificação).",
      )
      return
    } // pt-BR

    showAttractionsLoading(true)
    let attractionNames = []

    // Step 1: Gemini for names (Prompt in PT, use gemini-1.5-flash)
    const geminiPrompt = `Liste as 10 atrações turísticas ou pontos de interesse mais famosos e distintos especificamente na cidade de ${displayCityName}. Forneça apenas os nomes, cada um em uma nova linha. Não inclua números, descrições ou endereços. Certifique-se de que os nomes sejam de locais ou marcos reconhecíveis. Responda em Português Brasileiro.` // pt-BR
    // **** Use gemini-1.5-flash ****
    const geminiModel = "gemini-1.5-flash"
    // ****                           ****
    const geminiApiVersion = "v1" // Or v1beta if needed for flash, check docs if v1 fails
    const geminiUrl = `https://generativelanguage.googleapis.com/${geminiApiVersion}/models/${geminiModel}:generateContent?key=${GEMINI_API_KEY}`
    const geminiRequestBody = {
      contents: [{ parts: [{ text: geminiPrompt }] }],
      generationConfig: { maxOutputTokens: 200, temperature: 0.4 },
      safetySettings: [
        /* Standard safety settings */
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

    console.log(
      `Pedindo atrações ao Gemini (${geminiModel}) para:`,
      displayCityName,
    ) //pt-BR
    try {
      const response = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiRequestBody),
      })
      if (!response.ok) {
        let errorMsg = `Erro API Gemini (${geminiModel})! Status: ${response.status}` // pt-BR
        try {
          errorMsg = `Gemini Error: ${
            (await response.json()).error?.message || response.status
          }`
        } catch (e) {
          /*ignore*/
        }
        // Check for model incompatibility error specifically
        if (
          response.status === 404 ||
          (errorMsg.includes("not found") && errorMsg.includes(geminiModel))
        ) {
          errorMsg += ` Verifique se o modelo '${geminiModel}' está disponível na API v1 ou tente a v1beta.`
        }
        throw new Error(errorMsg)
      }
      const data = await response.json()
      console.log(`Resposta Gemini (${geminiModel}) (Nomes Atrações):`, data) //pt-BR
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
      if (text) {
        attractionNames = text
          .split("\n")
          .map((name) => name.trim().replace(/^- /, ""))
          .filter(Boolean)
        console.log("Nomes das Atrações:", attractionNames) //pt-BR
      } else {
        const finishReason = data?.candidates?.[0]?.finishReason
        const blockReason = data?.promptFeedback?.blockReason
        if (blockReason)
          throw new Error(`Geração da lista bloqueada: ${blockReason}.`) //pt-BR
        if (finishReason && finishReason !== "STOP")
          throw new Error(`Geração da lista falhou (${finishReason}).`) //pt-BR
        throw new Error("Não foi possível extrair nomes da resposta do Gemini.") // pt-BR
      }
    } catch (error) {
      console.error("Erro ao buscar nomes no Gemini:", error) //pt-BR
      displayAttractionError(
        `Falha ao obter lista de atrações da IA: ${error.message}`,
      ) // pt-BR
      showAttractionsLoading(false)
      return
    }

    if (attractionNames.length === 0) {
      displayAttractionPlaceholder(
        `IA não encontrou atrações específicas para ${cityName}.`,
      ) // pt-BR
      showAttractionsLoading(false)
      return
    }

    // Step 2: Geocode names (Using filter logic)
    console.log("Geocodificando nomes das atrações...") //pt-BR
    const geocodePromises = attractionNames.map((name) =>
      geocodeAttraction(name, cityName),
    )
    const geocodeResults = await Promise.allSettled(geocodePromises)
    const successfullyGeocodedAttractions = []
    geocodeResults.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value) {
        successfullyGeocodedAttractions.push(result.value)
      } else {
        console.warn(
          `Falha ao geocodificar "${attractionNames[index]}":`,
          result.reason || "Sem resultado",
        )
      } //pt-BR
    })
    console.log(
      "Geocodificados com Sucesso:",
      successfullyGeocodedAttractions.length,
      "/",
      attractionNames.length,
    ) //pt-BR

    // Step 3: Display
    if (successfullyGeocodedAttractions.length > 0) {
      displayAttractions(successfullyGeocodedAttractions)
    } else {
      displayAttractionError(
        `Não foi possível encontrar localizações no mapa para as atrações listadas em ${cityName}. Tente outra cidade?`,
      ) // pt-BR
    }
    showAttractionsLoading(false)
  }

  // --- Geocode Helper (Using Circle Filter - Existing) ---
  async function geocodeAttraction(attractionName, cityName) {
    const searchText = `${attractionName}, ${cityName}`
    let filterParam = ""
    const selectedOption = citySelector.options[citySelector.selectedIndex]
    const cityLon = selectedOption.getAttribute("data-lon")
    const cityLat = selectedOption.getAttribute("data-lat")
    const searchRadiusMeters = 30000 // 30km

    if (cityLon && cityLat) {
      filterParam = `&filter=circle:${cityLon},${cityLat},${searchRadiusMeters}`
      console.log(
        `Aplicando filtro de geocodificação: círculo ao redor de ${cityLat},${cityLon} com raio de ${searchRadiusMeters}m.`,
      ) // pt-BR
    } else {
      console.warn(
        `Coordenadas não encontradas para a cidade ${cityName} para aplicar filtro.`,
      )
    } // pt-BR

    const langParam = "&lang=pt"
    const geocodeUrl = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(
      searchText,
    )}&limit=1${filterParam}${langParam}&apiKey=${GEOAPIFY_API_KEY}`
    console.log(`Geocodificando "${attractionName}" com URL: ${geocodeUrl}`) // pt-BR

    try {
      const response = await fetch(geocodeUrl)
      if (!response.ok) {
        throw new Error(
          `Erro API Geocodificação Geoapify! Status: ${response.status}`,
        )
      } // pt-BR
      const data = await response.json()
      if (data?.features?.length > 0) {
        const feature = data.features[0]
        if (
          typeof feature.properties?.lat === "number" &&
          typeof feature.properties?.lon === "number"
        ) {
          console.log(`Geocodificado "${attractionName}" com sucesso.`) // pt-BR
          feature.properties.original_name = attractionName
          if (!feature.properties.name) feature.properties.name = attractionName
          console.log("Endereço Formatado:", feature.properties.formatted) // pt-BR
          return feature
        } else {
          throw new Error(
            `Resultado da geocodificação para "${attractionName}" sem coordenadas válidas.`,
          )
        } // pt-BR
      } else {
        throw new Error(
          `Nenhum resultado de geocodificação encontrado dentro do raio de busca para "${attractionName}" em ${cityName}.`,
        )
      } // pt-BR
    } catch (error) {
      console.error(
        `Erro de geocodificação para "${attractionName}":`,
        error.message,
      ) // pt-BR
      throw error
    }
  }

  // --- Display Attractions in the List (Existing) ---
  function displayAttractions(attractionFeatures) {
    attractionsListElement.innerHTML = ""
    attractionsPlaceholder.style.display = "none"
    attractionFeatures.forEach((feature) => {
      const properties = feature.properties
      const attractionName =
        properties.name || properties.original_name || "Atração sem nome" // pt-BR
      const lat = properties.lat
      const lon = properties.lon
      const li = document.createElement("li")
      li.textContent = attractionName
      li.dataset.lat = lat
      li.dataset.lon = lon
      li.dataset.properties = JSON.stringify(properties)
      li.addEventListener("click", handleAttractionClick)
      attractionsListElement.appendChild(li)
    })
  }

  // --- Fetch Image from Wikimedia Commons (Requesting Larger Thumbnail) ---
  async function fetchWikimediaImage(lat, lon, signal) {
    const endpoint = "https://commons.wikimedia.org/w/api.php"
    // **** Request larger width ****
    const imageWidth = 400
    // ****                       ****
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      generator: "geosearch",
      ggscoord: `${lat}|${lon}`,
      ggsradius: 1000,
      ggsnamespace: 6,
      ggslimit: 1,
      prop: "imageinfo",
      iiprop: "url",
      iiurlwidth: imageWidth, // Use updated width
    })
    const url = `${endpoint}?${params.toString()}`
    console.log("Consultando Wikimedia Commons:", url) //pt-BR
    try {
      const response = await fetch(url, { signal })
      if (!response.ok)
        throw new Error(`Erro API Wikimedia! Status: ${response.status}`) //pt-BR
      const data = await response.json()
      console.log("Resposta Wikimedia:", data) //pt-BR
      const pages = data.query?.pages
      if (pages) {
        const pageId = Object.keys(pages)[0]
        // Look for thumburl first, fallback to url (might be larger/original)
        const imageUrl =
          pages[pageId]?.imageinfo?.[0]?.thumburl ||
          pages[pageId]?.imageinfo?.[0]?.url
        if (imageUrl) {
          console.log("URL Imagem Wikimedia encontrada:", imageUrl)
          return imageUrl
        } //pt-BR
      }
      console.log(
        "Nenhuma imagem adequada encontrada na resposta Wikimedia para este local.",
      ) //pt-BR
      return null
    } catch (error) {
      if (error.name !== "AbortError")
        console.error("Erro ao buscar imagem Wikimedia:", error) //pt-BR
      else console.log("Busca Wikimedia abortada") //pt-BR
      return null
    }
  }

  // --- Handle Clicking an Attraction in the List (Existing) ---
  async function handleAttractionClick(event) {
    const targetLi = event.currentTarget
    const lat = parseFloat(targetLi.dataset.lat)
    const lon = parseFloat(targetLi.dataset.lon)
    if (currentGeminiRequestController) currentGeminiRequestController.abort()
    if (currentWikimediaRequestController)
      currentWikimediaRequestController.abort()
    let properties = {}
    try {
      properties = JSON.parse(targetLi.dataset.properties || "{}")
    } catch (e) {
      properties = { name: targetLi.textContent, lat: lat, lon: lon }
    }
    const name = targetLi.textContent
    const selectedOption = citySelector.options[citySelector.selectedIndex]
    const cityName = selectedOption.value || ""
    const displayCityName = selectedOption.text || cityName
    highlightSelectedItem(targetLi)
    displayAttractionDetails(properties, null, true, null)
    let imageUrl = null
    let geminiDescription = null
    let geminiError = null
    currentWikimediaRequestController = new AbortController()
    if (GEMINI_API_KEY && GEMINI_API_KEY !== "YOUR_GEMINI_API_KEY") {
      currentGeminiRequestController = new AbortController()
    } else {
      currentGeminiRequestController = null
      geminiError = "Chave da API Gemini não configurada em script.js."
      console.warn(geminiError)
    } // pt-BR
    const fetchPromises = []
    fetchPromises.push(
      fetchWikimediaImage(lat, lon, currentWikimediaRequestController.signal)
        .then((url) => {
          imageUrl = url
        })
        .catch((err) =>
          console.error("Falha na promise de busca Wikimedia:", err),
        )
        .finally(() => {
          currentWikimediaRequestController = null
        }),
    ) //pt-BR
    if (currentGeminiRequestController) {
      fetchPromises.push(
        fetchGeminiDescription(
          name,
          displayCityName,
          currentGeminiRequestController.signal,
        )
          .then((desc) => {
            geminiDescription = desc
          })
          .catch((error) => {
            if (error.name === "AbortError") {
              geminiError = "Carregamento da descrição cancelado."
            } else {
              geminiError = `Falha ao carregar descrição: ${error.message}`
            }
            console.error("Erro ao buscar descrição do Gemini:", error)
          })
          .finally(() => {
            currentGeminiRequestController = null
          }),
      )
    } //pt-BR
    await Promise.allSettled(fetchPromises)
    if (!isNaN(lat) && !isNaN(lon) && map) {
      showAttractionOnMap(lat, lon, name, properties, imageUrl)
    } else {
      console.error("Coordenadas inválidas ou mapa não pronto:", name)
    } // pt-BR
    displayAttractionDetails(properties, geminiDescription, false, geminiError)
  }

  // --- Highlight Selected List Item (Existing) ---
  function highlightSelectedItem(targetLi) {
    if (selectedListItem && selectedListItem !== targetLi) {
      selectedListItem.classList.remove("selected")
    }
    targetLi.classList.add("selected")
    selectedListItem = targetLi
  }

  // --- Fetch Description from Gemini API (Using gemini-1.5-flash) ---
  async function fetchGeminiDescription(
    attractionName,
    displayCityName,
    signal,
  ) {
    let prompt = `Forneça uma descrição turística concisa e envolvente (2-4 frases) em Português Brasileiro para "${attractionName}"` // pt-BR
    if (displayCityName && displayCityName !== "-- Selecione --") {
      prompt += ` localizado em ${displayCityName}. Foque na sua importância ou no que um visitante pode experienciar. Não use markdown.`
    } // pt-BR
    else {
      prompt += `. Foque na sua importância ou no que um visitante pode experienciar. Não use markdown.`
    } // pt-BR
    // **** Use gemini-1.5-flash ****
    const modelName = "gemini-1.5-flash"
    // ****                           ****
    const apiVersion = "v1" // Or v1beta if needed
    const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`
    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      safetySettings: [
        /* Standard safety settings */
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
    console.log(
      `Pedindo descrição ao Gemini (${modelName}) para: ${attractionName}`,
    ) // pt-BR
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: signal,
      })
      if (!response.ok) {
        let errorMsg = `Erro API Gemini (${modelName})! Status: ${response.status}` //pt-BR
        try {
          errorMsg = `Gemini Error: ${
            (await response.json()).error?.message || response.status
          }`
        } catch (e) {}
        if (
          response.status === 404 ||
          (errorMsg.includes("not found") && errorMsg.includes(modelName))
        ) {
          errorMsg += ` Verifique se o modelo '${modelName}' está disponível na API v1 ou tente a v1beta.`
        }
        throw new Error(errorMsg)
      }
      const data = await response.json()
      console.log(`Resposta API Descrição Gemini (${modelName}) recebida.`) // pt-BR
      let generatedText = data?.candidates?.[0]?.content?.parts?.[0]?.text
      if (!generatedText) {
        const finishReason = data?.candidates?.[0]?.finishReason
        const blockReason = data?.promptFeedback?.blockReason
        if (blockReason) throw new Error(`Descrição bloqueada: ${blockReason}.`) //pt-BR
        if (finishReason && finishReason !== "STOP")
          throw new Error(`Geração da descrição falhou (${finishReason}).`) //pt-BR
        throw new Error("Resposta inesperada do serviço de descrição.") // pt-BR
      }
      return generatedText.trim()
    } catch (error) {
      if (error.name === "AbortError") throw error
      console.error(
        `Erro durante chamada API descrição Gemini (${modelName}):`,
        error,
      ) // pt-BR
      throw new Error(error.message || "Erro desconhecido ao buscar descrição.") // pt-BR
    }
  }

  // --- Display Attraction Details (Category Translation PT - Existing) ---
  const categoryTranslations = {
    /* ... keep existing PT translations ... */ attraction: "Atração",
    museum: "Museu",
    heritage: "Patrimônio",
    historic: "Histórico",
    tourism: "Turismo",
    entertainment: "Entretenimento",
    artwork: "Obra de Arte",
    gallery: "Galeria",
    viewpoint: "Mirante",
    park: "Parque",
    religion: "Religião",
    church: "Igreja",
    cathedral: "Catedral",
    unesco_world_heritage: "Patrimônio UNESCO",
    monument: "Monumento",
    memorial: "Memorial",
    square: "Praça",
    architecture: "Arquitetura",
  }
  function displayAttractionDetails(
    properties,
    description,
    isLoadingDescription,
    descriptionError,
  ) {
    if (
      !detailsContainer ||
      !detailName ||
      !detailAddress ||
      !detailCategoriesContainer ||
      !detailDescriptionElement
    )
      return
    detailName.textContent =
      properties.name || properties.original_name || "N/A"
    detailAddress.textContent =
      properties.formatted || "Endereço não disponível" // pt-BR
    detailCategoriesContainer.innerHTML = ""
    const categories = properties.categories || []
    const ignoredPrefixes = [
      "wheelchair",
      "adult",
      "building",
      "place",
      "administrative",
      "tourism",
    ]
    let displayedTags = 0
    new Set(
      categories
        .filter(
          (cat) => !ignoredPrefixes.some((prefix) => cat.startsWith(prefix)),
        )
        .map((cat) => cat.split(/[._]/).pop()),
    ).forEach((key) => {
      const translated = categoryTranslations[key]
      if (translated) {
        const tagElement = document.createElement("span")
        tagElement.className = "category-tag"
        tagElement.textContent = translated
        detailCategoriesContainer.appendChild(tagElement)
        displayedTags++
      } else {
        console.log(`Missing PT translation for category key: ${key}`)
      }
    })
    if (displayedTags === 0) {
      const noCat = document.createElement("span")
      noCat.textContent = "Não especificado"
      noCat.style.fontStyle = "italic"
      detailCategoriesContainer.appendChild(noCat)
    } // pt-BR
    detailDescriptionLoader.style.display = isLoadingDescription
      ? "inline-block"
      : "none"
    detailDescriptionError.style.display = "none"
    detailDescriptionError.textContent = ""
    detailDescriptionElement.style.display = "block"
    if (isLoadingDescription) {
      detailDescriptionElement.textContent = "Carregando descrição..."
      detailDescriptionElement.style.fontStyle = "italic"
      detailDescriptionElement.style.color = "#888"
    } // pt-BR
    else if (descriptionError) {
      detailDescriptionError.textContent = descriptionError
      detailDescriptionError.style.display = "block"
      detailDescriptionElement.textContent = ""
      detailDescriptionElement.style.display = "none"
    } else if (description) {
      detailDescriptionElement.textContent = description
      detailDescriptionElement.style.fontStyle = "normal"
      detailDescriptionElement.style.color = "#555"
    } else {
      detailDescriptionElement.textContent = "Descrição não disponível."
      detailDescriptionElement.style.fontStyle = "italic"
      detailDescriptionElement.style.color = "#888"
    } // pt-BR
    detailsContainer.style.display = "block"
  }

  // --- Hide Attraction Details (Existing) ---
  function hideAttractionDetails() {
    if (detailsContainer) detailsContainer.style.display = "none"
    if (detailName) detailName.textContent = ""
    if (detailAddress) detailAddress.textContent = ""
    if (detailCategoriesContainer) detailCategoriesContainer.innerHTML = ""
    if (detailDescriptionElement) detailDescriptionElement.textContent = ""
    if (detailDescriptionLoader) detailDescriptionLoader.style.display = "none"
    if (detailDescriptionError) {
      detailDescriptionError.textContent = ""
      detailDescriptionError.style.display = "none"
    }
    if (selectedListItem) {
      selectedListItem.classList.remove("selected")
      selectedListItem = null
    }
    if (currentGeminiRequestController) currentGeminiRequestController.abort()
    if (currentWikimediaRequestController)
      currentWikimediaRequestController.abort()
    currentGeminiRequestController = null
    currentWikimediaRequestController = null
  }

  // --- Show Selected Attraction on Map (Existing) ---
  function showAttractionOnMap(
    lat,
    lon,
    name,
    properties = {},
    imageUrl = null,
  ) {
    clearAttractionMarker()
    map.flyTo([lat, lon], 16)
    let popupContent = `<b>${name}</b>`
    if (imageUrl) {
      console.log(`Usando imagem Wikimedia para ${name}: ${imageUrl}`)
      popupContent = `<img src="${imageUrl}" alt="${name}" class="popup-image" onerror="this.style.display='none'; console.warn('Falha ao carregar imagem do popup: ${imageUrl}')"><br/>${popupContent}`
    } //pt-BR
    else {
      console.log(`Nenhuma URL de imagem encontrada (Wikimedia) para ${name}.`)
    } //pt-BR
    currentAttractionMarker = L.marker([lat, lon])
      .addTo(map)
      .bindPopup(popupContent, { maxWidth: 250 })
      .openPopup()
  }

  // --- UI Helper Functions (Existing with PT Text) ---
  function resetAttractionsUI() {
    attractionsListElement.innerHTML = ""
    attractionsLoader.style.display = "none"
    attractionsErrorElement.textContent = ""
    attractionsErrorElement.style.display = "none"
    const placeholderText =
      document.getElementById("attractionsPlaceholder")?.textContent ||
      "Selecione uma cidade para ver as atrações." //pt-BR default
    attractionsPlaceholder.textContent = placeholderText
    attractionsPlaceholder.style.display = "block"
    hideAttractionDetails()
  }
  function showAttractionsLoading(isLoading) {
    attractionsLoader.style.display = isLoading ? "block" : "none"
    if (isLoading) {
      attractionsListElement.innerHTML = ""
      attractionsPlaceholder.style.display = "none"
      attractionsErrorElement.style.display = "none"
      hideAttractionDetails()
    }
  }
  function displayAttractionError(message) {
    resetAttractionsUI()
    attractionsErrorElement.textContent = message
    attractionsErrorElement.style.display = "block"
    attractionsPlaceholder.style.display = "none"
  }
  function displayAttractionPlaceholder(message) {
    resetAttractionsUI()
    attractionsPlaceholder.textContent = message
    attractionsPlaceholder.style.display = "block"
  }
  function clearAttractionMarker() {
    if (currentAttractionMarker && map) {
      map.removeLayer(currentAttractionMarker)
      currentAttractionMarker = null
    }
  }

  // --- Initialize ---
  initializeApp()
}) // End of DOMContentLoaded listener
