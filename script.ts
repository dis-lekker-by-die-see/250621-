// Import strategy types and functions
import {
  TradingPair,
  OHLCEntry,
  TrendFollowParams,
  DEFAULT_PARAMS,
  calculateTrendFollowStrategy,
  renderStrategyControls,
  renderStrategyTable,
} from "./TrendFollow.js";

interface PairState {
  existingData: OHLCEntry[] | null;
  updatedJson: OHLCEntry[] | null;
  logMessages: string[];
  params: TrendFollowParams;
}

const apiUrl: string = "https://lightchart.bitflyer.com/api/ohlc";
let currentPair: TradingPair = "FX_BTC_JPY";

// Per-pair state storage
const pairStates: Record<TradingPair, PairState> = {
  FX_BTC_JPY: {
    existingData: null,
    updatedJson: null,
    logMessages: [],
    params: { ...DEFAULT_PARAMS.FX_BTC_JPY },
  },
  BTC_JPY: {
    existingData: null,
    updatedJson: null,
    logMessages: [],
    params: { ...DEFAULT_PARAMS.BTC_JPY },
  },
};

// Convenience accessors for current pair's state
let existingData: OHLCEntry[] | null = null;
let updatedJson: OHLCEntry[] | null = null;

function log(message: string): void {
  // Store message in current pair's log history
  pairStates[currentPair].logMessages.push(message);

  const output = document.getElementById("output");
  if (output) {
    output.textContent += message + "\n";
  }
}

function getMostRecent9amJst(): number {
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

function getTimestampedFilename(): string {
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000; // JST is UTC+9 in milliseconds
  const jstTime = new Date(
    now.getTime() + jstOffset + now.getTimezoneOffset() * 60 * 1000,
  );
  const year = jstTime.getFullYear().toString().slice(-2); // YY
  const month = (jstTime.getMonth() + 1).toString().padStart(2, "0"); // MM
  const day = jstTime.getDate().toString().padStart(2, "0"); // DD
  const hours = jstTime.getHours().toString().padStart(2, "0"); // HH (24-hour)
  const minutes = jstTime.getMinutes().toString().padStart(2, "0"); // MM
  const seconds = jstTime.getSeconds().toString().padStart(2, "0"); // SS
  return `${currentPair}-OHLC-d-all_${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function formatJstDate(timestampMs: number): string {
  const date = new Date(timestampMs);
  const jstOffset = 9 * 60 * 60 * 1000; // JST is UTC+9
  const jstTime = new Date(
    date.getTime() + jstOffset + date.getTimezoneOffset() * 60 * 1000,
  );
  const year = jstTime.getFullYear();
  const month = (jstTime.getMonth() + 1).toString().padStart(2, "0");
  const day = jstTime.getDate().toString().padStart(2, "0");
  const hours = jstTime.getHours().toString().padStart(2, "0");
  const minutes = jstTime.getMinutes().toString().padStart(2, "0");
  return `${year}-${month}-${day}_${hours}:${minutes}`;
}

function formatPrice(value: number | null): string {
  if (value == null) return "0";
  return Math.round(value).toLocaleString("en-US", { useGrouping: true });
}

// Update input boxes with current pair's params
function updateInputsFromParams(): void {
  const params = pairStates[currentPair].params;
  const sma1Input = document.getElementById("sma1Periods") as HTMLInputElement;
  const sma2Input = document.getElementById("sma2Periods") as HTMLInputElement;
  const stdDevPeriodsInput = document.getElementById(
    "stdDevPeriods",
  ) as HTMLInputElement;
  const stdDevCutOffInput = document.getElementById(
    "stdDevCutOff",
  ) as HTMLInputElement;

  if (sma1Input) sma1Input.value = params.sma1Periods.toString();
  if (sma2Input) sma2Input.value = params.sma2Periods.toString();
  if (stdDevPeriodsInput)
    stdDevPeriodsInput.value = params.stdDevPeriods.toString();
  if (stdDevCutOffInput)
    stdDevCutOffInput.value = params.stdDevCutOff.toString();
}

// Save input values to current pair's params
function saveParamsFromInputs(): void {
  const sma1Input = document.getElementById("sma1Periods") as HTMLInputElement;
  const sma2Input = document.getElementById("sma2Periods") as HTMLInputElement;
  const stdDevPeriodsInput = document.getElementById(
    "stdDevPeriods",
  ) as HTMLInputElement;
  const stdDevCutOffInput = document.getElementById(
    "stdDevCutOff",
  ) as HTMLInputElement;

  pairStates[currentPair].params.sma1Periods =
    parseFloat(sma1Input?.value || "2") || 2;
  pairStates[currentPair].params.sma2Periods =
    parseFloat(sma2Input?.value || "11") || 11;
  pairStates[currentPair].params.stdDevPeriods =
    parseInt(stdDevPeriodsInput?.value || "3") || 3;
  pairStates[currentPair].params.stdDevCutOff =
    parseFloat(stdDevCutOffInput?.value || "4.1") || 4.1;
}

function updateTable(data: OHLCEntry[]): void {
  if (!data) return;
  const tbody = document.querySelector("#jsonTable tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  // Save current input values to current pair's params
  saveParamsFromInputs();

  // Copy data and fill backward null CLOSE prices
  const filledData: OHLCEntry[] = data.map((row) => [...row] as OHLCEntry);
  let lastClose = 0;
  for (let i = filledData.length - 1; i >= 0; i--) {
    if (filledData[i][4] === null) {
      filledData[i][4] = lastClose;
    } else {
      lastClose = filledData[i][4] as number;
    }
  }

  // Get long-only setting
  const toggleLongOnly = document.getElementById(
    "toggleLongOnly",
  ) as HTMLInputElement;
  const isLongOnly = toggleLongOnly?.checked ?? false;

  // Calculate strategy using TrendFollow
  const result = calculateTrendFollowStrategy(
    filledData,
    pairStates[currentPair].params,
    isLongOnly,
  );

  const {
    sma1Values,
    sma2Values,
    stdDevValues,
    SIDE,
    positions,
    plValues,
    totalValues,
  } = result;

  // Render table rows
  data.forEach((row, index) => {
    const tr = document.createElement("tr");
    let closeBgColor = "";
    let sideBgColor =
      SIDE[index] === 1
        ? "background-color: #c4eccc;"
        : SIDE[index] === -1
          ? "background-color: #fcc4cc;"
          : "background-color: #fcec9c;";
    if (index < filledData.length - 1) {
      const nextClose = filledData[index + 1][4] as number;
      const currentClose = filledData[index][4] as number;
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
      <td style="${closeBgColor}">${formatPrice(filledData[index][4] as number)}</td>
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

function toggleColumns(): void {
  const toggleColumnsCheckbox = document.getElementById(
    "toggleColumns",
  ) as HTMLInputElement;
  const isChecked = toggleColumnsCheckbox?.checked ?? true;
  const extraColumns = document.querySelectorAll(".extra");
  extraColumns.forEach((col) => {
    (col as HTMLElement).style.display = isChecked ? "" : "none";
  });
}

function toggleLongOnly(): void {
  updateTable(existingData || updatedJson || []);
}

function changePair(): void {
  console.log("changePair called");
  const selectedRadio = document.querySelector(
    'input[name="pairSelect"]:checked',
  ) as HTMLInputElement;
  const newPair = selectedRadio?.value as TradingPair;
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

    // Update input boxes with new pair's params
    updateInputsFromParams();

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
    const jsonFileInput = document.getElementById(
      "jsonFileInput",
    ) as HTMLInputElement;
    const getDataBtn = document.getElementById(
      "getDataBtn",
    ) as HTMLButtonElement;

    if (jsonFileInput) jsonFileInput.disabled = existingData !== null;
    if (getDataBtn) getDataBtn.disabled = existingData === null;

    // If new pair has no data yet, auto-load it
    if (!existingData) {
      log(`Trading Pair Changed: Switched to ${currentPair}`);
      loadSavedData();
    } else {
      log(`Trading Pair Changed: Switched to ${currentPair}`);
    }
  }
}

async function loadSavedData(): Promise<void> {
  log(`Load Saved Data: Loading ${currentPair}-OHLC-d-all.json`);
  existingData = null;
  try {
    const cacheBuster = `?_=${new Date().getTime()}`;
    const response = await fetch(
      `${currentPair}-OHLC-d-all.json${cacheBuster}`,
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data: OHLCEntry[] = await response.json();
    existingData = data;
    log(`Load Saved Data: Loaded ${existingData.length} entries`);
    updateTable(existingData);
    const jsonFileInput = document.getElementById(
      "jsonFileInput",
    ) as HTMLInputElement;
    const getDataBtn = document.getElementById(
      "getDataBtn",
    ) as HTMLButtonElement;
    if (jsonFileInput) jsonFileInput.disabled = true;
    if (getDataBtn) getDataBtn.disabled = false;
  } catch (error) {
    log(`Error: ${(error as Error).message}`);
  }
}

async function uploadJson(): Promise<void> {
  log("Upload JSON: Selecting file");
  try {
    const fileInput = document.getElementById(
      "jsonFileInput",
    ) as HTMLInputElement;
    if (!fileInput?.files?.length) {
      throw new Error("No file selected");
    }
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = function (event) {
      try {
        existingData = JSON.parse(
          event.target?.result as string,
        ) as OHLCEntry[];
        log(`Upload JSON: Loaded ${existingData!.length} entries`);
        updateTable(existingData!);
        const getDataBtn = document.getElementById(
          "getDataBtn",
        ) as HTMLButtonElement;
        if (getDataBtn) getDataBtn.disabled = false;
      } catch (error) {
        log(`Error: Invalid JSON format - ${(error as Error).message}`);
      }
    };
    reader.readAsText(file);
  } catch (error) {
    log(`Error: ${(error as Error).message}`);
  }
}

async function getNewData(): Promise<void> {
  log("Get New Data: Starting process");
  try {
    if (!existingData) {
      throw new Error("No JSON file uploaded");
    }
    let latestTimestamp: number | null = null;
    if (existingData.length > 0) {
      latestTimestamp = Math.max(...existingData.map((entry) => entry[0]));
      log(
        `Latest Timestamp Found: ${latestTimestamp} (${new Date(
          latestTimestamp,
        ).toISOString()})`,
      );
    } else {
      log("No Existing Data: Using most recent 9:00 AM JST");
    }
    const recent9amMs = getMostRecent9amJst();
    const beforeMs =
      latestTimestamp && latestTimestamp > recent9amMs
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
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://lightchart.bitflyer.com/",
        Origin: "https://lightchart.bitflyer.com",
      },
    });
    log(
      `HTTP ${response.status} ${
        response.ok ? "OK" : "Error"
      }: 1-Day Response received`,
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data: OHLCEntry[] = await response.json();
    if (!Array.isArray(data)) {
      log("Invalid 1-Day API Response: Not a list");
      return;
    }

    let newData: OHLCEntry[] = [];
    if (data.length > 0) {
      const formattedData = data
        .filter((entry) => entry.length >= 10)
        .map((entry) => entry.slice(0, 10) as OHLCEntry);
      log(`1-Day Data Retrieved: ${formattedData.length} entries formatted`);
      const existingTimestamps = new Set(existingData.map((entry) => entry[0]));
      newData = formattedData.filter(
        (entry) => !existingTimestamps.has(entry[0]),
      );
      log(
        `1-Day New Data Filtered: ${newData.length} unique entries to prepend`,
      );
      if (newData.length > 0) {
        existingData = newData.concat(existingData);
        log(`1-Day Data Prepended: ${newData.length} entries added`);
      } else {
        log("No New 1-Day Data: No entries to prepend");
      }
    } else {
      log("No New 1-Day Data Available: API returned empty list");
    }

    // Check if current time is between 09:00 and 09:30 JST
    const now = new Date();
    const jstOffset = 9 * 60 * 60 * 1000; // JST is UTC+9
    const jstTime = new Date(
      now.getTime() + jstOffset + now.getTimezoneOffset() * 60 * 1000,
    );
    const jstHours = jstTime.getHours();
    const jstMinutes = jstTime.getMinutes();
    const isBetween9and930 =
      jstHours === 9 && jstMinutes >= 0 && jstMinutes <= 30;
    log(
      `Current JST Time: ${formatJstDate(
        jstTime.getTime(),
      )} JST, Between 09:00-09:30: ${isBetween9and930 ? "Yes" : "No"}`,
    );

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
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://lightchart.bitflyer.com/",
          Origin: "https://lightchart.bitflyer.com",
        },
      });
      log(
        `HTTP ${minuteResponse.status} ${
          minuteResponse.ok ? "OK" : "Error"
        }: 1-Minute Response received`,
      );
      if (!minuteResponse.ok) {
        log(
          `1-Minute Fetch Error: HTTP ${minuteResponse.status}: ${minuteResponse.statusText}`,
        );
      } else {
        const minuteData: OHLCEntry[] = await minuteResponse.json();
        if (!Array.isArray(minuteData)) {
          log("Invalid 1-Minute API Response: Not a list");
        } else {
          log(`1-Minute Data Retrieved: ${minuteData.length} entries`);
          // Find first non-null CLOSE from timestamp[1] to timestamp[30]
          let newClose: number | null = null;
          for (let i = 1; i <= 30 && i < minuteData.length; i++) {
            if (minuteData[i] && minuteData[i][4] !== null) {
              newClose = minuteData[i][4] as number;
              log(`Found 1-Minute CLOSE: ${newClose} at timestamp[${i}]`);
              break;
            }
          }
          if (newClose !== null) {
            existingData[0][4] = newClose;
            log(`Updated Latest 1-Day CLOSE to ${newClose}`);
          } else {
            log(
              "No valid 1-minute CLOSE found in timestamp[1] to timestamp[30]",
            );
          }
        }
      }
    } else if (!isBetween9and930) {
      log("Skipping 1-minute fetch: Outside 09:00-09:30 JST");
    }

    updateTable(existingData);
    const saveJsonBtn = document.getElementById(
      "saveJsonBtn",
    ) as HTMLButtonElement;
    if (saveJsonBtn) saveJsonBtn.disabled = false;
  } catch (error) {
    log(`Error: ${(error as Error).message}`);
  }
}

function saveNewJson(): void {
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

function downloadCsv(): void {
  const table = document.getElementById("jsonTable");
  if (!table) return;

  let csv: string[] = [];
  const rows = table.querySelectorAll("tr");
  rows.forEach((row) => {
    const cols = row.querySelectorAll("th, td");
    const rowData: string[] = [];
    cols.forEach((col) => {
      // Skip hidden extra columns
      if (
        col.classList.contains("extra") &&
        (col as HTMLElement).style.display === "none"
      ) {
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
  // Render strategy UI
  const strategyControlsContainer = document.getElementById("strategyControls");
  const strategyTableContainer = document.getElementById("strategyTable");

  if (strategyControlsContainer) {
    strategyControlsContainer.innerHTML = renderStrategyControls();
  }
  if (strategyTableContainer) {
    strategyTableContainer.innerHTML = renderStrategyTable();
  }

  // Ensure pair label matches the default
  const pairLabel = document.getElementById("currentPairLabel");
  if (pairLabel) {
    pairLabel.textContent = currentPair;
  }

  // Initialize input boxes with default pair's params
  updateInputsFromParams();

  // Add event listeners to input boxes
  const sma1Input = document.getElementById("sma1Periods");
  const sma2Input = document.getElementById("sma2Periods");
  const stdDevPeriodsInput = document.getElementById("stdDevPeriods");
  const stdDevCutOffInput = document.getElementById("stdDevCutOff");

  if (sma1Input)
    sma1Input.addEventListener("change", () => {
      if (existingData) updateTable(existingData);
    });
  if (sma2Input)
    sma2Input.addEventListener("change", () => {
      if (existingData) updateTable(existingData);
    });
  if (stdDevPeriodsInput)
    stdDevPeriodsInput.addEventListener("change", () => {
      if (existingData) updateTable(existingData);
    });
  if (stdDevCutOffInput)
    stdDevCutOffInput.addEventListener("change", () => {
      if (existingData) updateTable(existingData);
    });

  // Add event listeners to radio buttons
  const radioButtons = document.querySelectorAll('input[name="pairSelect"]');
  radioButtons.forEach((radio) => {
    radio.addEventListener("change", changePair);
  });

  // Add event listeners to buttons
  const getDataBtn = document.getElementById("getDataBtn");
  const saveJsonBtn = document.getElementById("saveJsonBtn");
  const downloadCsvBtn = document.getElementById("downloadCsvBtn");
  const jsonFileInput = document.getElementById("jsonFileInput");
  const toggleColumnsCheckbox = document.getElementById("toggleColumns");
  const toggleLongOnlyCheckbox = document.getElementById("toggleLongOnly");

  if (getDataBtn) getDataBtn.addEventListener("click", getNewData);
  if (saveJsonBtn) saveJsonBtn.addEventListener("click", saveNewJson);
  if (downloadCsvBtn) downloadCsvBtn.addEventListener("click", downloadCsv);
  if (jsonFileInput) jsonFileInput.addEventListener("change", uploadJson);
  if (toggleColumnsCheckbox)
    toggleColumnsCheckbox.addEventListener("change", toggleColumns);
  if (toggleLongOnlyCheckbox)
    toggleLongOnlyCheckbox.addEventListener("change", toggleLongOnly);

  loadSavedData();
});
