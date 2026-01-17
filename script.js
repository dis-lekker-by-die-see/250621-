"use strict";
const apiUrl = "https://lightchart.bitflyer.com/api/ohlc";
let currentPair = "FX_BTC_JPY";
// Per-pair state storage
const pairStates = {
    FX_BTC_JPY: { existingData: null, updatedJson: null, logMessages: [] },
    BTC_JPY: { existingData: null, updatedJson: null, logMessages: [] },
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
function formatPrice(value) {
    if (value == null)
        return "0";
    return Math.round(value).toLocaleString("en-US", { useGrouping: true });
}
// EMA
function calculateSMA1(data, periods1) {
    if (!data || data.length === 0)
        return [];
    const sma1 = new Array(data.length).fill(null);
    if (data.length > 0) {
        sma1[data.length - 1] =
            data[data.length - 1][4] !== null
                ? Math.round(data[data.length - 1][4])
                : null; // Initialize with oldest closing price
        for (let i = data.length - 2; i >= 0; i--) {
            const currentClose = data[i][4];
            const prevSMA = sma1[i + 1];
            if (currentClose !== null && prevSMA !== null) {
                sma1[i] = Math.round((prevSMA * (periods1 - 1) + currentClose) / periods1);
            }
            else {
                sma1[i] = prevSMA; // Use previous SMA if current close is null
            }
        }
    }
    return sma1;
}
function calculateSMA2(data, periods2) {
    if (!data || data.length === 0)
        return [];
    const sma2 = new Array(data.length).fill(null);
    if (data.length > 0) {
        sma2[data.length - 1] =
            data[data.length - 1][4] !== null
                ? Math.round(data[data.length - 1][4])
                : null; // Initialize with oldest closing price
        for (let i = data.length - 2; i >= 0; i--) {
            const currentClose = data[i][4];
            const prevSMA = sma2[i + 1];
            if (currentClose !== null && prevSMA !== null) {
                sma2[i] = Math.round((prevSMA * (periods2 - 1) + currentClose) / periods2);
            }
            else {
                sma2[i] = prevSMA; // Use previous SMA if current close is null
            }
        }
    }
    return sma2;
}
function calculateStdDev(data, stdDevPeriods) {
    if (!data || data.length === 0)
        return [];
    const stdDev = new Array(data.length).fill(0);
    for (let i = data.length - 1; i >= 0; i--) {
        let sum = 0;
        let count = 0;
        let values = [];
        // Collect CLOSE prices from index i to i + stdDevPeriods - 1 (newer rows)
        for (let j = i; j < Math.min(data.length, i + Math.floor(stdDevPeriods)); j++) {
            const close = data[j][4];
            if (close !== 0 && close !== null) {
                // Exclude 0 (filled nulls)
                sum += close;
                count++;
                values.push(close);
            }
        }
        if (count > 0) {
            const mean = sum / count;
            // Calculate population standard deviation (STDEV.P)
            const varianceSum = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0);
            const stdDevP = Math.sqrt(varianceSum / count);
            // Scale as (STDEV.P / CLOSE[i]) * 100
            const closeValue = data[i][4];
            stdDev[i] =
                closeValue !== 0 && closeValue !== null
                    ? (stdDevP / closeValue) * 100
                    : 0;
        }
        // If no valid values, stdDev stays 0 (default)
    }
    return stdDev;
}
function updateTable(data) {
    if (!data)
        return;
    const tbody = document.querySelector("#jsonTable tbody");
    if (!tbody)
        return;
    tbody.innerHTML = "";
    const periods1Input = document.getElementById("sma1Periods");
    const periods2Input = document.getElementById("sma2Periods");
    const periods1 = parseFloat(periods1Input?.value || "1") || 1;
    const periods2 = parseFloat(periods2Input?.value || "1") || 1;
    const stdDevPeriods = 2;
    const stdDevCutOff = 4.2;
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
    const sma1Values = calculateSMA1(filledData, periods1);
    const sma2Values = calculateSMA2(filledData, periods2);
    const stdDevValues = calculateStdDev(filledData, stdDevPeriods);
    const SIDE = new Array(data.length).fill(0);
    const positions = new Array(data.length).fill(0);
    const plValues = new Array(data.length).fill(0);
    const totalValues = new Array(data.length).fill(0);
    let lastPosition = 0;
    let runningTotal = 0;
    // Calculate SIDE, positions, P/L, and total bottom up
    for (let i = filledData.length - 1; i >= 0; i--) {
        const row = filledData[i];
        // Step 1: SMA1 comparison
        if (i === filledData.length - 1 ||
            (sma1Values[i] ?? 0) > (sma1Values[i + 1] ?? 0)) {
            SIDE[i] = 1; // Long
        }
        else {
            SIDE[i] = -1; // Short
        }
        // Step 2: STD DEV check
        if (stdDevValues[i] > stdDevCutOff) {
            SIDE[i] = 0; // No position
        }
        // Step 3: SMA1 vs SMA2 check
        if ((sma1Values[i] ?? 0) < (sma2Values[i] ?? 0)) {
            SIDE[i] = 0; // No position
        }
        // Step 4: Long Only filter
        const toggleLongOnly = document.getElementById("toggleLongOnly");
        if (toggleLongOnly?.checked && SIDE[i] === -1) {
            SIDE[i] = 0; // No position if short and long-only enabled
        }
        // Validate SIDE
        if (![1, -1, 0].includes(SIDE[i])) {
            throw new Error("Invalid SIDE value");
        }
        // Calculate Position
        if (i === filledData.length - 1 || SIDE[i] !== SIDE[i + 1]) {
            positions[i] = SIDE[i] === 0 ? 0 : row[4]; // Close position (0) or new position
        }
        else {
            positions[i] = lastPosition;
        }
        lastPosition = positions[i];
        // Calculate P/L
        if (i < filledData.length - 1 && positions[i + 1] !== 0) {
            if (SIDE[i + 1] === 1) {
                // Previous was long
                plValues[i] = row[4] - positions[i + 1];
            }
            else if (SIDE[i + 1] === -1) {
                // Previous was short
                plValues[i] = positions[i + 1] - row[4];
            }
            else if (SIDE[i + 1] === 0) {
                // No previous position
                plValues[i] = 0;
            }
            // Add P/L to running total on SIDE change
            if (i < filledData.length - 1 && SIDE[i] !== SIDE[i + 1]) {
                runningTotal += plValues[i];
            }
        }
        totalValues[i] = runningTotal;
    }
    // Render table rows
    data.forEach((row, index) => {
        const tr = document.createElement("tr");
        let closeBgColor = "";
        let sideBgColor = SIDE[index] === 1
            ? "background-color: #c4eccc;"
            : SIDE[index] === -1
                ? "background-color: #fcc4cc;"
                : "background-color: #fcec9c;";
        if (index < filledData.length - 1) {
            const nextClose = filledData[index + 1][4];
            const currentClose = filledData[index][4];
            if (currentClose !== 0 && nextClose !== 0) {
                closeBgColor =
                    currentClose > nextClose
                        ? "background-color: #c4eccc;"
                        : currentClose < nextClose
                            ? "background-color: #fcc4cc;"
                            : "";
            }
        }
        tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${formatJstDate(row[0])}</td>
      <td style="${closeBgColor}">${formatPrice(filledData[index][4])}</td>
      <td style="${sideBgColor}">${SIDE[index]}</td>
      <td>${formatPrice(positions[index])}</td>
      <td>${formatPrice(plValues[index])}</td>
      <td>${formatPrice(totalValues[index])}</td>
      <td>${formatPrice(sma1Values[index])}</td>
      <td>${formatPrice(sma2Values[index])}</td>
      <td>${stdDevValues[index].toFixed(4)}</td>
      <td class="extra">${row[0]}</td>
      <td class="extra">${formatPrice(row[1])}</td>
      <td class="extra">${formatPrice(row[2])}</td>
      <td class="extra">${formatPrice(row[3])}</td>
      <td class="extra">${formatPrice(row[4])}</td>
      <td class="extra">${row[5] ?? "0"}</td>
      <td class="extra">${row[6] ?? "0"}</td>
      <td class="extra">${row[7] ?? "0"}</td>
      <td class="extra">${row[8] ?? "0"}</td>
      <td class="extra">${row[9] ?? "0"}</td>
    `;
        tbody.appendChild(tr);
    });
    toggleColumns();
}
function toggleColumns() {
    const toggleColumnsCheckbox = document.getElementById("toggleColumns");
    const isChecked = toggleColumnsCheckbox?.checked ?? true;
    const extraColumns = document.querySelectorAll(".extra");
    extraColumns.forEach((col) => {
        col.style.display = isChecked ? "" : "none";
    });
}
function toggleLongOnly() {
    updateTable(existingData || updatedJson || []);
}
function changePair() {
    console.log("changePair called");
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
window.addEventListener("DOMContentLoaded", () => {
    loadSavedData();
});
