// Wait for the DOM to be fully loaded
document.addEventListener("DOMContentLoaded", () => {
  // --- DOM Elements ---
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

  // --- NO API KEYS HERE ---

  // --- State Variables ---
  let map = null
  let currentAttractionMarker = null
  let selectedListItem = null
  let currentGeminiRequestController = null // Keep for description cancellation
  let currentWikimediaRequestController = null // Keep for image cancellation

  // --- Resizer State ---
  let isResizing = false
  let startX, startWidth

  // --- Initialization ---
  function initializeApp() {
    if (!mapElement) {
      console.error("Elemento container do mapa (#map) não encontrado!")
      return
    }
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
    }
    initializeResizer()
    resetAttractionsUI()
  }

  function initializeResizer() {
    if (!resizer || !sidebar || !mapContainer) {
      console.error("Elementos do redimensionador não encontrados.")
      return
    } // pt-BR
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

  // --- Handle City Selection Change ---
  function handleCitySelection() {
    const selectedOption = citySelector.options[citySelector.selectedIndex]
    const cityName = selectedOption.value
    const displayCityName = selectedOption.text // Name for prompts
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
      // Fetch attractions using our new backend function
      fetchAttractionsFromBackend(displayCityName, lat, lon)
    }
  }

  // --- Fetch Attractions from Our Backend ---
  async function fetchAttractionsFromBackend(
    displayCityName,
    cityLat,
    cityLon,
  ) {
    showAttractionsLoading(true)
    try {
      // Call our Vercel serverless function
      const response = await fetch("/api/getAttractions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayCityName, cityLat, cityLon }), // Send necessary data
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) // Try to get error details
        throw new Error(
          errorData.error ||
            `Erro do servidor (${response.status}) ao buscar atrações.`, // pt-BR
        )
      }

      const data = await response.json()

      if (data.attractions && data.attractions.length > 0) {
        displayAttractions(data.attractions) // Display the geocoded results
      } else if (data.attractions && data.attractions.length === 0) {
        displayAttractionPlaceholder(
          `Nenhuma atração encontrada ou geocodificada para ${displayCityName}.`, // pt-BR
        )
      } else {
        throw new Error("Resposta inesperada do servidor ao buscar atrações.") // pt-BR
      }
    } catch (error) {
      console.error("Erro ao buscar atrações do backend:", error) // pt-BR
      displayAttractionError(
        `Falha ao carregar atrações: ${error.message}`, // pt-BR
      )
    } finally {
      showAttractionsLoading(false)
    }
  }

  // --- Geocode Helper (REMOVED - Logic moved to backend) ---
  // async function geocodeAttraction(attractionName, cityName) { ... }

  // --- Display Attractions in the List (Mostly unchanged) ---
  function displayAttractions(attractionFeatures) {
    attractionsListElement.innerHTML = ""
    attractionsPlaceholder.style.display = "none"
    attractionsErrorElement.style.display = "none" // Clear errors

    if (!attractionFeatures || attractionFeatures.length === 0) {
      displayAttractionPlaceholder("Nenhuma atração para exibir.") // pt-BR
      return
    }

    attractionFeatures.forEach((feature) => {
      // Data structure now comes directly from our backend function
      const properties = feature.properties
      const attractionName =
        properties.name || properties.original_name || "Atração sem nome" // pt-BR
      const lat = properties.lat
      const lon = properties.lon

      // Check if lat/lon are valid before creating list item
      if (typeof lat !== "number" || typeof lon !== "number") {
        console.warn(
          `Atração "${attractionName}" pulada devido a coordenadas inválidas.`,
        ) // pt-BR
        return // Skip this attraction
      }

      const li = document.createElement("li")
      li.textContent = attractionName
      li.dataset.lat = lat
      li.dataset.lon = lon
      li.dataset.properties = JSON.stringify(properties) // Keep storing properties
      li.addEventListener("click", handleAttractionClick)
      attractionsListElement.appendChild(li)
    })

    // If after filtering invalid coords, the list is empty
    if (attractionsListElement.children.length === 0) {
      displayAttractionPlaceholder(
        "Nenhuma atração com localização válida encontrada.",
      ) // pt-BR
    }
  }

  // --- Fetch Image from Wikimedia Commons (Unchanged - No API Key) ---
  async function fetchWikimediaImage(lat, lon, signal) {
    const endpoint = "https://commons.wikimedia.org/w/api.php"
    const imageWidth = 400
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
      iiurlwidth: imageWidth,
    })
    const url = `${endpoint}?${params.toString()}`
    try {
      const response = await fetch(url, { signal })
      if (!response.ok)
        throw new Error(`Erro API Wikimedia! Status: ${response.status}`) //pt-BR
      const data = await response.json()
      const pages = data.query?.pages
      if (pages) {
        const pageId = Object.keys(pages)[0]
        const imageUrl =
          pages[pageId]?.imageinfo?.[0]?.thumburl ||
          pages[pageId]?.imageinfo?.[0]?.url
        if (imageUrl) return imageUrl
      }
      return null
    } catch (error) {
      if (error.name !== "AbortError")
        console.error("Erro ao buscar imagem Wikimedia:", error) //pt-BR
      else console.log("Busca Wikimedia abortada") //pt-BR
      return null
    }
  }

  // --- Handle Clicking an Attraction in the List ---
  async function handleAttractionClick(event) {
    const targetLi = event.currentTarget
    const lat = parseFloat(targetLi.dataset.lat)
    const lon = parseFloat(targetLi.dataset.lon)

    // Abort previous fetches if any
    if (currentGeminiRequestController) currentGeminiRequestController.abort()
    if (currentWikimediaRequestController)
      currentWikimediaRequestController.abort()

    let properties = {}
    try {
      properties = JSON.parse(targetLi.dataset.properties || "{}")
    } catch (e) {
      console.error("Erro ao parsear propriedades:", e) // pt-BR
      properties = { name: targetLi.textContent, lat: lat, lon: lon }
    }

    const name =
      properties.name || properties.original_name || targetLi.textContent // Best available name
    const selectedOption = citySelector.options[citySelector.selectedIndex]
    const displayCityName = selectedOption.text || selectedOption.value || ""

    highlightSelectedItem(targetLi)
    displayAttractionDetails(properties, null, true, null) // Show details, loading description

    // Setup new AbortControllers
    currentWikimediaRequestController = new AbortController()
    currentGeminiRequestController = new AbortController() // For description fetch

    let imageUrl = null
    let geminiDescription = null
    let geminiError = null

    // Fetch image (client-side is fine) and description (via backend)
    const fetchPromises = [
      fetchWikimediaImage(lat, lon, currentWikimediaRequestController.signal)
        .then((url) => {
          imageUrl = url
        })
        .catch((err) => console.error("Falha promise Wikimedia:", err)) // pt-BR
        .finally(() => {
          currentWikimediaRequestController = null
        }),

      // Call our backend function for the description
      fetchGeminiDescriptionFromBackend(
        name,
        displayCityName,
        currentGeminiRequestController.signal,
      )
        .then((desc) => {
          geminiDescription = desc
        })
        .catch((error) => {
          if (error.name === "AbortError") {
            geminiError = "Carregamento da descrição cancelado." // pt-BR
            console.log(geminiError)
          } else {
            geminiError = `Falha ao carregar descrição: ${error.message}` // pt-BR
            console.error("Erro ao buscar descrição do backend:", error) // pt-BR
          }
        })
        .finally(() => {
          currentGeminiRequestController = null
        }),
    ]

    await Promise.allSettled(fetchPromises)

    // Update map and details
    if (!isNaN(lat) && !isNaN(lon) && map) {
      showAttractionOnMap(lat, lon, name, properties, imageUrl)
    } else {
      console.error("Coordenadas inválidas ou mapa não pronto:", name) // pt-BR
    }
    displayAttractionDetails(properties, geminiDescription, false, geminiError) // Update details with fetched data
  }

  // --- Highlight Selected List Item (Unchanged) ---
  function highlightSelectedItem(targetLi) {
    if (selectedListItem && selectedListItem !== targetLi) {
      selectedListItem.classList.remove("selected")
    }
    targetLi.classList.add("selected")
    selectedListItem = targetLi
  }

  // --- Fetch Description from Our Backend ---
  async function fetchGeminiDescriptionFromBackend(
    attractionName,
    displayCityName,
    signal,
  ) {
    try {
      const response = await fetch("/api/getDescription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attractionName, displayCityName }),
        signal: signal, // Pass the signal for cancellation
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        // Provide specific user-facing error if possible
        let message =
          errorData.error ||
          `Erro do servidor (${response.status}) ao buscar descrição.`
        if (response.status === 429) {
          // Specific handling for rate limits etc.
          message = "Muitas requisições. Por favor, tente novamente mais tarde." // pt-BR
        }
        if (errorData.blocked) {
          // Handle safety blocks from Gemini via backend
          message =
            "A descrição não pôde ser gerada devido a restrições de conteúdo." // pt-BR
        }
        throw new Error(message)
      }

      const data = await response.json()
      if (typeof data.description === "string") {
        return data.description
      } else {
        throw new Error("Resposta inesperada do servidor (descrição).") // pt-BR
      }
    } catch (error) {
      if (error.name === "AbortError") {
        // Re-throw AbortError so the caller (handleAttractionClick) can identify it
        throw error
      }
      console.error("Erro no fetch da descrição do backend:", error) // pt-BR
      // Re-throw other errors with the message extracted/generated above
      throw new Error(error.message || "Erro desconhecido ao buscar descrição.") // pt-BR
    }
  }

  // --- Display Attraction Details (Category Translation PT - Mostly Unchanged) ---
  const categoryTranslations = {
    attraction: "Atração",
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
      "tourism.",
    ]
    const relevantKeys = new Set()
    categories.forEach((cat) => {
      if (ignoredPrefixes.some((prefix) => cat.startsWith(prefix))) return
      const key = cat.split(/[._]/).pop()
      if (key) relevantKeys.add(key)
    })

    let displayedTags = 0
    relevantKeys.forEach((key) => {
      const translated = categoryTranslations[key]
      if (translated) {
        const tagElement = document.createElement("span")
        tagElement.className = "category-tag"
        tagElement.textContent = translated
        detailCategoriesContainer.appendChild(tagElement)
        displayedTags++
      }
    })
    if (displayedTags === 0) {
      const noCat = document.createElement("span")
      noCat.textContent = "Não especificado" // pt-BR
      noCat.style.fontStyle = "italic"
      noCat.style.color = "#666"
      detailCategoriesContainer.appendChild(noCat)
    }

    // Description Handling
    detailDescriptionLoader.style.display = isLoadingDescription
      ? "inline-block"
      : "none"
    detailDescriptionError.style.display = "none"
    detailDescriptionError.textContent = ""
    detailDescriptionElement.style.display = "block"

    if (isLoadingDescription) {
      detailDescriptionElement.textContent = "Carregando descrição..." // pt-BR
      detailDescriptionElement.style.fontStyle = "italic"
      detailDescriptionElement.style.color = "#888"
    } else if (descriptionError) {
      detailDescriptionError.textContent = descriptionError // Use the error message passed in
      detailDescriptionError.style.display = "block"
      detailDescriptionElement.textContent = ""
      detailDescriptionElement.style.display = "none"
    } else if (description) {
      detailDescriptionElement.textContent = description
      detailDescriptionElement.style.fontStyle = "normal"
      detailDescriptionElement.style.color = "#555"
    } else {
      detailDescriptionElement.textContent = "Descrição não disponível." // pt-BR
      detailDescriptionElement.style.fontStyle = "italic"
      detailDescriptionElement.style.color = "#888"
    }

    detailsContainer.style.display = "block"
  }

  // --- Hide Attraction Details (Unchanged, but aborts are still relevant) ---
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
    // Abort ongoing backend description fetch or wikimedia fetch
    if (currentGeminiRequestController) {
      currentGeminiRequestController.abort()
      currentGeminiRequestController = null
    }
    if (currentWikimediaRequestController) {
      currentWikimediaRequestController.abort()
      currentWikimediaRequestController = null
    }
  }

  // --- Show Selected Attraction on Map (Unchanged) ---
  function showAttractionOnMap(
    lat,
    lon,
    name,
    properties = {},
    imageUrl = null,
  ) {
    clearAttractionMarker()
    if (!map) return
    map.flyTo([lat, lon], 16)
    let popupContent = `<b>${name}</b>`
    if (imageUrl) {
      popupContent = `<img src="${imageUrl}" alt="${name}" class="popup-image" onerror="this.style.display='none'; console.warn('Falha ao carregar imagem popup: ${imageUrl}')"><br/>${popupContent}` // pt-BR
    }
    currentAttractionMarker = L.marker([lat, lon])
      .addTo(map)
      .bindPopup(popupContent, { maxWidth: 250 })
      .openPopup()
  }

  // --- UI Helper Functions (Mostly Unchanged) ---
  function resetAttractionsUI() {
    attractionsListElement.innerHTML = ""
    attractionsLoader.style.display = "none"
    attractionsErrorElement.textContent = ""
    attractionsErrorElement.style.display = "none"
    const placeholderElement = document.getElementById("attractionsPlaceholder")
    if (placeholderElement) {
      placeholderElement.textContent =
        "Selecione uma cidade para ver as atrações." //pt-BR
      placeholderElement.style.display = "block"
    }
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
    attractionsListElement.innerHTML = ""
    attractionsLoader.style.display = "none"
    attractionsPlaceholder.style.display = "none"
    attractionsErrorElement.textContent = message
    attractionsErrorElement.style.display = "block"
    hideAttractionDetails()
  }
  function displayAttractionPlaceholder(message) {
    resetAttractionsUI()
    const placeholderElement = document.getElementById("attractionsPlaceholder")
    if (placeholderElement) {
      placeholderElement.textContent = message
      placeholderElement.style.display = "block"
    }
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
