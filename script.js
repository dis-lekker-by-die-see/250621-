// App configuration
const APP_CONFIG = {
    defaultPair: "FX_BTC_JPY",
    defaultStrategy: "TrendFollow",
    availablePairs: [
        { value: "FX_BTC_JPY", label: "FX_BTC_JPY" },
        { value: "BTC_JPY", label: "BTC_JPY" },
    ],
    availableStrategies: [
        { value: "TrendFollow", label: "Trend Follow" },
        { value: "TrendHodl", label: "Trend HODL" },
    ],
};
const apiUrl = "https://lightchart.bitflyer.com/api/ohlc";
let currentPair = APP_CONFIG.defaultPair;
let currentStrategy = APP_CONFIG.defaultStrategy;
let strategyModule = null;
// Per-pair state storage (params will be initialized after strategy loads)
const pairStates = {
    FX_BTC_JPY: {
        existingData: null,
        updatedJson: null,
        logMessages: [],
        params: {},
    },
    BTC_JPY: {
        existingData: null,
        updatedJson: null,
        logMessages: [],
        params: {},
    },
};
// Convenience accessors for current pair's state
let existingData = null;
let updatedJson = null;
function log(message) {
    // Store message in current pair's log history
    pairStates[currentPair].logMessages.push(message);
    const output = document.getElementById("output");
    if (output) {
        output.textContent += message + "\n";
    }
}
function getMostRecent9amJst() {
    const now = new Date();
    const jstOffset = 9 * 60; // JST is UTC+9
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const jstMinutes = (utcMinutes + jstOffset) % (24 * 60);
    const jstHour = Math.floor(jstMinutes / 60);
    let recent9am = new Date(now);
    recent9am.setUTCHours(0, 0, 0, 0); // Midnight UTC
    recent9am.setUTCDate(recent9am.getUTCDate() - 1); // Previous day
    log(`Most Recently Completed 1 Day: ${recent9am.getTime()}`);
    return recent9am.getTime();
}
function getTimestampedFilename() {
    const now = new Date();
    const jstOffset = 9 * 60 * 60 * 1000; // JST is UTC+9 in milliseconds
    const jstTime = new Date(now.getTime() + jstOffset + now.getTimezoneOffset() * 60 * 1000);
    const year = jstTime.getFullYear().toString().slice(-2); // YY
    const month = (jstTime.getMonth() + 1).toString().padStart(2, "0"); // MM
    const day = jstTime.getDate().toString().padStart(2, "0"); // DD
    const hours = jstTime.getHours().toString().padStart(2, "0"); // HH (24-hour)
    const minutes = jstTime.getMinutes().toString().padStart(2, "0"); // MM
    const seconds = jstTime.getSeconds().toString().padStart(2, "0"); // SS
    return `${currentPair}-OHLC-d-all_${year}${month}${day}-${hours}${minutes}${seconds}`;
}
function formatJstDate(timestampMs) {
    const date = new Date(timestampMs);
    const jstOffset = 9 * 60 * 60 * 1000; // JST is UTC+9
    const jstTime = new Date(date.getTime() + jstOffset + date.getTimezoneOffset() * 60 * 1000);
    const year = jstTime.getFullYear();
    const month = (jstTime.getMonth() + 1).toString().padStart(2, "0");
    const day = jstTime.getDate().toString().padStart(2, "0");
    const hours = jstTime.getHours().toString().padStart(2, "0");
    const minutes = jstTime.getMinutes().toString().padStart(2, "0");
    return `${year}-${month}-${day}_${hours}:${minutes}`;
}
// Render pair selector HTML
function renderPairSelector() {
    return `
    <div class="pair-selector">
      ${APP_CONFIG.availablePairs
        .map((pair) => `
        <label class="radio-label">
          <input type="radio" name="pairSelect" value="${pair.value}" 
            ${pair.value === APP_CONFIG.defaultPair ? "checked" : ""} />
          ${pair.label}
        </label>
      `)
        .join("")}
    </div>
  `;
}
// Render strategy selector HTML
function renderStrategySelector() {
    return `
    <div class="strategy-selector">
      ${APP_CONFIG.availableStrategies
        .map((strat) => `
        <label class="radio-label">
          <input type="radio" name="strategySelect" value="${strat.value}"
            ${strat.value === APP_CONFIG.defaultStrategy ? "checked" : ""} />
          ${strat.label}
        </label>
      `)
        .join("")}
    </div>
  `;
}
// Switch to a different strategy
async function switchStrategy(strategyName) {
    try {
        // Dynamic import of strategy module
        strategyModule = await import(`./${strategyName}.js`);
        // Initialize params from strategy defaults for all pairs
        APP_CONFIG.availablePairs.forEach((pair) => {
            // Only set params if strategy supports this pair
            if (strategyModule.DEFAULT_PARAMS[pair.value]) {
                pairStates[pair.value].params = {
                    ...strategyModule.DEFAULT_PARAMS[pair.value],
                };
            }
        });
        // Render strategy UI
        const strategyControlsContainer = document.getElementById("strategyControls");
        const strategyTableContainer = document.getElementById("strategyTable");
        if (strategyControlsContainer) {
            strategyControlsContainer.innerHTML = ""; // Clear first
            strategyControlsContainer.innerHTML =
                strategyModule.renderStrategyControls(currentPair);
        }
        if (strategyTableContainer) {
            strategyTableContainer.innerHTML = ""; // Clear first
            strategyTableContainer.innerHTML = strategyModule.renderStrategyTable();
        }
        // Re-attach event listeners for dynamically created elements
        attachStrategyEventListeners();
        // Setup strategy-specific event listeners if available
        if (strategyModule.setupEventListeners) {
            strategyModule.setupEventListeners(updateTable, () => pairStates[currentPair].existingData, saveParamsFromInputs);
        }
        // Update table with current pair's data if available
        const existingData = pairStates[currentPair].existingData;
        if (existingData) {
            updateTable(existingData);
        }
        log(`Strategy switched to: ${strategyName}`);
    }
    catch (error) {
        log(`Error loading strategy ${strategyName}: ${error}`);
    }
}
// Attach event listeners to strategy-specific controls
function attachStrategyEventListeners() {
    // Update inputs from current pair's params
    updateInputsFromParams();
    // Set min date for date picker if it exists
    const startDateInput = document.getElementById("startDate");
    if (startDateInput && strategyModule && strategyModule.getMinStartDate) {
        const minDate = strategyModule.getMinStartDate(currentPair);
        startDateInput.min = minDate;
    }
    // Get all input elements and attach change listeners
    const allInputs = document.querySelectorAll("#strategyControls input[type='number'], #strategyControls input[type='date']");
    allInputs.forEach((input) => {
        input.addEventListener("change", () => {
            saveParamsFromInputs();
            const data = pairStates[currentPair].existingData;
            console.log("Input change - existingData:", !!data);
            if (data)
                updateTable(data);
        });
    });
    // Attach listeners to checkboxes (if they exist)
    const toggleColumnsCheckbox = document.getElementById("toggleColumns");
    if (toggleColumnsCheckbox && strategyModule && strategyModule.toggleColumns) {
        toggleColumnsCheckbox.addEventListener("change", strategyModule.toggleColumns);
    }
}
function formatPrice(value) {
    if (value == null)
        return "0";
    return Math.round(value).toLocaleString("en-US", { useGrouping: true });
}
// Update input boxes with current pair's params
function updateInputsFromParams() {
    if (strategyModule && strategyModule.updateInputsFromParams) {
        strategyModule.updateInputsFromParams(pairStates[currentPair].params);
    }
}
// Save input values to current pair's params
function saveParamsFromInputs() {
    if (strategyModule && strategyModule.saveParamsFromInputs) {
        pairStates[currentPair].params = strategyModule.saveParamsFromInputs();
    }
}
function updateTable(data) {
    if (!data)
        return;
    const tbody = document.querySelector("#jsonTable tbody");
    if (!tbody)
        return;
    tbody.innerHTML = "";
    // Save current input values to current pair's params
    saveParamsFromInputs();
    // Copy data and fill backward null CLOSE prices
    const filledData = data.map((row) => [...row]);
    let lastClose = 0;
    for (let i = filledData.length - 1; i >= 0; i--) {
        if (filledData[i][4] === null) {
            filledData[i][4] = lastClose;
        }
        else {
            lastClose = filledData[i][4];
        }
    }
    // Calculate strategy using current strategy module
    if (!strategyModule) {
        log("Strategy module not loaded");
        return;
    }
    // Get the appropriate calculation function
    const calculateFunc = strategyModule.calculateTrendHodlStrategy ||
        strategyModule.calculateTrendFollowStrategy;
    if (!calculateFunc) {
        log("Strategy calculation function not found");
        return;
    }
    console.log("About to call calculateFunc with params:", pairStates[currentPair].params);
    // Let strategy determine parameters (including longOnly if applicable)
    const result = calculateFunc(filledData, pairStates[currentPair].params);
    // Let strategy render its own table rows
    if (strategyModule.renderTableRows) {
        strategyModule.renderTableRows(tbody, data, filledData, result, formatJstDate, formatPrice, currentPair);
        // Call strategy's post-render function if it exists
        if (strategyModule.toggleColumns) {
            strategyModule.toggleColumns();
        }
    }
    else {
        log("Strategy renderTableRows function not found");
    }
}
function changePair() {
    const selectedRadio = document.querySelector('input[name="pairSelect"]:checked');
    const newPair = selectedRadio?.value;
    console.log("Current pair:", currentPair, "New pair:", newPair);
    console.log("pairStates:", pairStates);
    if (!newPair || newPair === currentPair) {
        return;
    }
    if (newPair !== currentPair) {
        // Save current pair's state (ensure it exists first)
        if (pairStates[currentPair]) {
            pairStates[currentPair].existingData = existingData;
            pairStates[currentPair].updatedJson = updatedJson;
        }
        // Switch to new pair
        currentPair = newPair;
        // Update pair label
        const pairLabel = document.getElementById("currentPairLabel");
        if (pairLabel) {
            pairLabel.textContent = currentPair;
        }
        // Re-render strategy controls for new pair
        const strategyControlsContainer = document.getElementById("strategyControls");
        if (strategyControlsContainer && strategyModule) {
            strategyControlsContainer.innerHTML = "";
            strategyControlsContainer.innerHTML =
                strategyModule.renderStrategyControls(currentPair);
        }
        // Update input boxes with new pair's params
        updateInputsFromParams();
        // Re-attach event listeners
        attachStrategyEventListeners();
        // Setup strategy-specific event listeners if available
        if (strategyModule && strategyModule.setupEventListeners) {
            strategyModule.setupEventListeners(updateTable, () => pairStates[currentPair].existingData, saveParamsFromInputs);
        }
        // Restore new pair's state
        existingData = pairStates[currentPair].existingData;
        updatedJson = pairStates[currentPair].updatedJson;
        // Restore log
        const output = document.getElementById("output");
        if (output) {
            output.textContent = pairStates[currentPair].logMessages.join("\n");
            if (pairStates[currentPair].logMessages.length > 0) {
                output.textContent += "\n";
            }
        }
        // Restore table
        const tbody = document.querySelector("#jsonTable tbody");
        if (tbody) {
            tbody.innerHTML = "";
            if (existingData) {
                updateTable(existingData);
            }
        }
        // Update button states
        const jsonFileInput = document.getElementById("jsonFileInput");
        const getDataBtn = document.getElementById("getDataBtn");
        if (jsonFileInput)
            jsonFileInput.disabled = existingData !== null;
        if (getDataBtn)
            getDataBtn.disabled = existingData === null;
        // If new pair has no data yet, auto-load it
        if (!existingData) {
            log(`Trading Pair Changed: Switched to ${currentPair}`);
            loadSavedData();
        }
        else {
            log(`Trading Pair Changed: Switched to ${currentPair}`);
        }
    }
}
async function loadSavedData() {
    log(`Load Saved Data: Loading ${currentPair}-OHLC-d-all.json`);
    existingData = null;
    try {
        const cacheBuster = `?_=${new Date().getTime()}`;
        const response = await fetch(`${currentPair}-OHLC-d-all.json${cacheBuster}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        existingData = data;
        pairStates[currentPair].existingData = data;
        log(`Load Saved Data: Loaded ${existingData.length} entries`);
        updateTable(existingData);
        const jsonFileInput = document.getElementById("jsonFileInput");
        const getDataBtn = document.getElementById("getDataBtn");
        if (jsonFileInput)
            jsonFileInput.disabled = true;
        if (getDataBtn)
            getDataBtn.disabled = false;
    }
    catch (error) {
        log(`Error: ${error.message}`);
    }
}
async function uploadJson() {
    log("Upload JSON: Selecting file");
    try {
        const fileInput = document.getElementById("jsonFileInput");
        if (!fileInput?.files?.length) {
            throw new Error("No file selected");
        }
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = function (event) {
            try {
                existingData = JSON.parse(event.target?.result);
                pairStates[currentPair].existingData = existingData;
                log(`Upload JSON: Loaded ${existingData.length} entries`);
                updateTable(existingData);
                const getDataBtn = document.getElementById("getDataBtn");
                if (getDataBtn)
                    getDataBtn.disabled = false;
            }
            catch (error) {
                log(`Error: Invalid JSON format - ${error.message}`);
            }
        };
        reader.readAsText(file);
    }
    catch (error) {
        log(`Error: ${error.message}`);
    }
}
async function getNewData() {
    log("Get New Data: Starting process");
    try {
        if (!existingData) {
            throw new Error("No JSON file uploaded");
        }
        let latestTimestamp = null;
        if (existingData.length > 0) {
            latestTimestamp = Math.max(...existingData.map((entry) => entry[0]));
            log(`Latest Timestamp Found: ${latestTimestamp} (${new Date(latestTimestamp).toISOString()})`);
        }
        else {
            log("No Existing Data: Using most recent 9:00 AM JST");
        }
        const recent9amMs = getMostRecent9amJst();
        const beforeMs = latestTimestamp && latestTimestamp > recent9amMs
            ? latestTimestamp
            : recent9amMs;
        log(`API Query Before: ${beforeMs} (${new Date(beforeMs).toISOString()})`);
        // Fetch 1-day data
        const params = new URLSearchParams({
            symbol: currentPair,
            period: "d",
            before: beforeMs.toString(),
        });
        log(`GET 1-Day Data: ${apiUrl}?${params.toString()}`);
        const response = await fetch(`${apiUrl}?${params}`, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                Accept: "application/json, text/plain, */*",
                "Accept-Language": "en-US,en;q=0.9",
                Referer: "https://lightchart.bitflyer.com/",
                Origin: "https://lightchart.bitflyer.com",
            },
        });
        log(`HTTP ${response.status} ${response.ok ? "OK" : "Error"}: 1-Day Response received`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        if (!Array.isArray(data)) {
            log("Invalid 1-Day API Response: Not a list");
            return;
        }
        let newData = [];
        if (data.length > 0) {
            const formattedData = data
                .filter((entry) => entry.length >= 10)
                .map((entry) => entry.slice(0, 10));
            log(`1-Day Data Retrieved: ${formattedData.length} entries formatted`);
            const existingTimestamps = new Set(existingData.map((entry) => entry[0]));
            newData = formattedData.filter((entry) => !existingTimestamps.has(entry[0]));
            log(`1-Day New Data Filtered: ${newData.length} unique entries to prepend`);
            if (newData.length > 0) {
                existingData = newData.concat(existingData);
                pairStates[currentPair].existingData = existingData;
                log(`1-Day Data Prepended: ${newData.length} entries added`);
            }
            else {
                log("No New 1-Day Data: No entries to prepend");
            }
        }
        else {
            log("No New 1-Day Data Available: API returned empty list");
        }
        // Check if current time is between 09:00 and 09:30 JST
        const now = new Date();
        const jstOffset = 9 * 60 * 60 * 1000; // JST is UTC+9
        const jstTime = new Date(now.getTime() + jstOffset + now.getTimezoneOffset() * 60 * 1000);
        const jstHours = jstTime.getHours();
        const jstMinutes = jstTime.getMinutes();
        const isBetween9and930 = jstHours === 9 && jstMinutes >= 0 && jstMinutes <= 30;
        log(`Current JST Time: ${formatJstDate(jstTime.getTime())} JST, Between 09:00-09:30: ${isBetween9and930 ? "Yes" : "No"}`);
        // Fetch 1-minute data only if new 1-day data was added and time is 09:00-09:30 JST
        if (newData.length > 0 && isBetween9and930) {
            const minuteBeforeMs = beforeMs + 86400000;
            const minuteParams = new URLSearchParams({
                symbol: currentPair,
                period: "m",
                before: minuteBeforeMs.toString(),
            });
            log(`GET 1-Minute Data: ${apiUrl}?${minuteParams.toString()}`);
            const minuteResponse = await fetch(`${apiUrl}?${minuteParams}`, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                    Accept: "application/json, text/plain, */*",
                    "Accept-Language": "en-US,en;q=0.9",
                    Referer: "https://lightchart.bitflyer.com/",
                    Origin: "https://lightchart.bitflyer.com",
                },
            });
            log(`HTTP ${minuteResponse.status} ${minuteResponse.ok ? "OK" : "Error"}: 1-Minute Response received`);
            if (!minuteResponse.ok) {
                log(`1-Minute Fetch Error: HTTP ${minuteResponse.status}: ${minuteResponse.statusText}`);
            }
            else {
                const minuteData = await minuteResponse.json();
                if (!Array.isArray(minuteData)) {
                    log("Invalid 1-Minute API Response: Not a list");
                }
                else {
                    log(`1-Minute Data Retrieved: ${minuteData.length} entries`);
                    // Find first non-null CLOSE from timestamp[1] to timestamp[30]
                    let newClose = null;
                    for (let i = 1; i <= 30 && i < minuteData.length; i++) {
                        if (minuteData[i] && minuteData[i][4] !== null) {
                            newClose = minuteData[i][4];
                            log(`Found 1-Minute CLOSE: ${newClose} at timestamp[${i}]`);
                            break;
                        }
                    }
                    if (newClose !== null) {
                        existingData[0][4] = newClose;
                        pairStates[currentPair].existingData = existingData;
                        log(`Updated Latest 1-Day CLOSE to ${newClose}`);
                    }
                    else {
                        log("No valid 1-minute CLOSE found in timestamp[1] to timestamp[30]");
                    }
                }
            }
        }
        else if (!isBetween9and930) {
            log("Skipping 1-minute fetch: Outside 09:00-09:30 JST");
        }
        updateTable(existingData);
        const saveJsonBtn = document.getElementById("saveJsonBtn");
        if (saveJsonBtn)
            saveJsonBtn.disabled = false;
    }
    catch (error) {
        log(`Error: ${error.message}`);
    }
}
function saveNewJson() {
    const dataToSave = existingData || [];
    const blob = new Blob([JSON.stringify(dataToSave, null, 2)], {
        type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = getTimestampedFilename() + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    log(`Save New JSON: Prompted to save ${a.download}`);
}
function downloadCsv() {
    const table = document.getElementById("jsonTable");
    if (!table)
        return;
    let csv = [];
    const rows = table.querySelectorAll("tr");
    rows.forEach((row) => {
        const cols = row.querySelectorAll("th, td");
        const rowData = [];
        cols.forEach((col) => {
            // Skip hidden extra columns
            if (col.classList.contains("extra") &&
                col.style.display === "none") {
                return;
            }
            let cellText = col.textContent?.trim() || "";
            // Escape quotes and wrap in quotes if contains commas or quotes
            if (cellText.includes(",") || cellText.includes('"')) {
                cellText = `"${cellText.replace(/"/g, '""')}"`;
            }
            rowData.push(cellText);
        });
        if (rowData.length > 0) {
            csv.push(rowData.join(","));
        }
    });
    const csvContent = csv.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = getTimestampedFilename() + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    log(`Download CSV: Prompted to save ${a.download}`);
}
// Auto-load default pair on page load
window.addEventListener("DOMContentLoaded", async () => {
    // Inject pair selector
    const pairSelectorContainer = document.getElementById("pairSelector");
    if (pairSelectorContainer) {
        pairSelectorContainer.innerHTML = renderPairSelector();
    }
    // Inject strategy selector
    const strategySelectorContainer = document.getElementById("strategySelector");
    if (strategySelectorContainer) {
        strategySelectorContainer.innerHTML = renderStrategySelector();
    }
    // Load default strategy
    await switchStrategy(APP_CONFIG.defaultStrategy);
    // Ensure pair label matches the default
    const pairLabel = document.getElementById("currentPairLabel");
    if (pairLabel) {
        pairLabel.textContent = currentPair;
    }
    // Add event listeners to pair radio buttons
    const pairRadioButtons = document.querySelectorAll('input[name="pairSelect"]');
    pairRadioButtons.forEach((radio) => {
        radio.addEventListener("change", changePair);
    });
    // Add event listeners to strategy radio buttons
    const strategyRadioButtons = document.querySelectorAll('input[name="strategySelect"]');
    strategyRadioButtons.forEach((radio) => {
        radio.addEventListener("change", async (e) => {
            const target = e.target;
            currentStrategy = target.value;
            await switchStrategy(currentStrategy);
        });
    });
    // Add event listeners to buttons
    const getDataBtn = document.getElementById("getDataBtn");
    const saveJsonBtn = document.getElementById("saveJsonBtn");
    const downloadCsvBtn = document.getElementById("downloadCsvBtn");
    const jsonFileInput = document.getElementById("jsonFileInput");
    if (getDataBtn)
        getDataBtn.addEventListener("click", getNewData);
    if (saveJsonBtn)
        saveJsonBtn.addEventListener("click", saveNewJson);
    if (downloadCsvBtn)
        downloadCsvBtn.addEventListener("click", downloadCsv);
    if (jsonFileInput)
        jsonFileInput.addEventListener("change", uploadJson);
    loadSavedData();
});
export {};
