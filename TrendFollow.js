// Default parameters for each trading pair
export const DEFAULT_PARAMS = {
    FX_BTC_JPY: {
        sma1Periods: 2,
        sma2Periods: 11,
        stdDevPeriods: 3,
        stdDevCutOff: 4.1,
        longOnly: false,
    },
    BTC_JPY: {
        sma1Periods: 2,
        sma2Periods: 11,
        stdDevPeriods: 3,
        stdDevCutOff: 4.1,
        longOnly: true,
    },
};
// EMA calculation
function calculateSMA1(data, periods1) {
    if (!data || data.length === 0)
        return [];
    const sma1 = new Array(data.length).fill(null);
    if (data.length > 0) {
        sma1[data.length - 1] =
            data[data.length - 1][4] !== null
                ? Math.round(data[data.length - 1][4])
                : null;
        for (let i = data.length - 2; i >= 0; i--) {
            const currentClose = data[i][4];
            const prevSMA = sma1[i + 1];
            if (currentClose !== null && prevSMA !== null) {
                sma1[i] = Math.round((prevSMA * (periods1 - 1) + currentClose) / periods1);
            }
            else {
                sma1[i] = prevSMA;
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
                : null;
        for (let i = data.length - 2; i >= 0; i--) {
            const currentClose = data[i][4];
            const prevSMA = sma2[i + 1];
            if (currentClose !== null && prevSMA !== null) {
                sma2[i] = Math.round((prevSMA * (periods2 - 1) + currentClose) / periods2);
            }
            else {
                sma2[i] = prevSMA;
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
        for (let j = i; j < Math.min(data.length, i + Math.floor(stdDevPeriods)); j++) {
            const close = data[j][4];
            if (close !== 0 && close !== null) {
                sum += close;
                count++;
                values.push(close);
            }
        }
        if (count > 0) {
            const mean = sum / count;
            const varianceSum = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0);
            const stdDevP = Math.sqrt(varianceSum / count);
            const closeValue = data[i][4];
            stdDev[i] =
                closeValue !== 0 && closeValue !== null
                    ? (stdDevP / closeValue) * 100
                    : 0;
        }
    }
    return stdDev;
}
// Main strategy calculation
export function calculateTrendFollowStrategy(data, params, isLongOnly) {
    console.log("calculateTrendFollowStrategy called with params:", params);
    // Get longOnly from params or checkbox
    if (isLongOnly === undefined) {
        isLongOnly = params.longOnly;
    }
    console.log("Long Only:", isLongOnly);
    const sma1Values = calculateSMA1(data, params.sma1Periods);
    const sma2Values = calculateSMA2(data, params.sma2Periods);
    console.log("SMA1[0]:", sma1Values[0], "SMA2[0]:", sma2Values[0]);
    const stdDevValues = calculateStdDev(data, params.stdDevPeriods);
    const SIDE = new Array(data.length).fill(0);
    const positions = new Array(data.length).fill(0);
    const plValues = new Array(data.length).fill(0);
    const totalValues = new Array(data.length).fill(0);
    let lastPosition = 0;
    let runningTotal = 0;
    const useSlopeLogic = params.sma1Periods === params.sma2Periods;
    // Calculate SIDE, positions, P/L, and total bottom up
    for (let i = data.length - 1; i >= 0; i--) {
        const row = data[i];
        if (useSlopeLogic) {
            // When periods equal, use SMA slope
            // Data is newest-first, so i+1 is previous day
            if (i === data.length - 1) {
                SIDE[i] = 0; // No previous data
            }
            else if ((sma1Values[i] ?? 0) > (sma1Values[i + 1] ?? 0)) {
                SIDE[i] = 1; // Long when rising
            }
            else if ((sma1Values[i] ?? 0) < (sma1Values[i + 1] ?? 0)) {
                SIDE[i] = -1; // Short when falling
            }
            else {
                SIDE[i] = 0; // Flat when unchanged
            }
        }
        else {
            // Crossover logic
            // Step 1: SMA1 comparison
            if (i === data.length - 1 ||
                (sma1Values[i] ?? 0) > (sma1Values[i + 1] ?? 0)) {
                SIDE[i] = 1; // Long
            }
            else {
                SIDE[i] = -1; // Short
            }
            // Step 3: SMA1 vs SMA2 check
            if ((sma1Values[i] ?? 0) < (sma2Values[i] ?? 0)) {
                SIDE[i] = 0; // No position
            }
        }
        // Step 2: STD DEV check (applies to both logic types)
        if (stdDevValues[i] > params.stdDevCutOff) {
            SIDE[i] = 0; // No position
        }
        // Step 4: Long Only filter
        if (isLongOnly && SIDE[i] === -1) {
            SIDE[i] = 0; // No position if short and long-only enabled
        }
        // Validate SIDE
        if (![1, -1, 0].includes(SIDE[i])) {
            throw new Error("Invalid SIDE value");
        }
        // Calculate Position
        if (i === data.length - 1 || SIDE[i] !== SIDE[i + 1]) {
            positions[i] = SIDE[i] === 0 ? 0 : row[4];
        }
        else {
            positions[i] = lastPosition;
        }
        lastPosition = positions[i];
        // Calculate P/L
        if (i < data.length - 1 && positions[i + 1] !== 0) {
            if (SIDE[i + 1] === 1) {
                plValues[i] = row[4] - positions[i + 1];
            }
            else if (SIDE[i + 1] === -1) {
                plValues[i] = positions[i + 1] - row[4];
            }
            else if (SIDE[i + 1] === 0) {
                plValues[i] = 0;
            }
            if (i < data.length - 1 && SIDE[i] !== SIDE[i + 1]) {
                runningTotal += plValues[i];
            }
        }
        totalValues[i] = runningTotal;
    }
    return {
        sma1Values,
        sma2Values,
        stdDevValues,
        SIDE,
        positions,
        plValues,
        totalValues,
    };
}
// Render strategy controls HTML
export function renderStrategyControls(pair) {
    const showLongOnly = pair !== "BTC_JPY";
    return `
    <div class="controls">
      <label for="sma1Periods">SMA1</label>
      <input type="number" id="sma1Periods" min="1" />

      <label for="sma2Periods">SMA2</label>
      <input type="number" id="sma2Periods" min="1" />
      <br />
      <label for="stdDevPeriods">StdDev</label>
      <input type="number" id="stdDevPeriods" step="1" min="1" />

      <label for="stdDevCutOff">CutOff</label>
      <input type="number" id="stdDevCutOff" step="0.1" min="0" />
    </div>
    <div>
      <label>
        <input type="checkbox" id="toggleColumns" unchecked />
        OHLC Columns
      </label>
      ${showLongOnly
        ? `<label>
        <input type="checkbox" id="toggleLongOnly" unchecked />
        Long Only
      </label>`
        : ""}
    </div>
  `;
}
// Render strategy table HTML
export function renderStrategyTable() {
    return `
    <div class="table-container">
      <table id="jsonTable">
        <thead>
          <tr>
            <th>Row</th>
            <th>OPEN Date Time</th>
            <th>CLOSE</th>
            <th>SIDE</th>
            <th>Position</th>
            <th>P/L</th>
            <th>Total</th>
            <th>SMA1</th>
            <th>SMA2</th>
            <th>STD DEV</th>
            <th class="extra">Timestamp</th>
            <th class="extra">OPEN</th>
            <th class="extra">HIGH</th>
            <th class="extra">LOW</th>
            <th class="extra">CLOSE</th>
            <th class="extra">VOL</th>
            <th class="extra">ASK</th>
            <th class="extra">BID</th>
            <th class="extra">SELL VOL</th>
            <th class="extra">BUY VOL</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  `;
}
// Render table rows
export function renderTableRows(tbody, data, filledData, result, formatJstDate, formatPrice) {
    const { sma1Values, sma2Values, stdDevValues, SIDE, positions, plValues, totalValues, } = result;
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
}
// Toggle OHLC columns visibility
export function toggleColumns() {
    const toggleColumnsCheckbox = document.getElementById("toggleColumns");
    const isChecked = toggleColumnsCheckbox?.checked ?? true;
    const extraColumns = document.querySelectorAll(".extra");
    extraColumns.forEach((col) => {
        col.style.display = isChecked ? "" : "none";
    });
}
// Setup strategy-specific event listeners
export function setupEventListeners(updateTableCallback, getCurrentData) {
    console.log("TrendFollow setupEventListeners called");
    // Long Only toggle
    const toggleLongOnlyCheckbox = document.getElementById("toggleLongOnly");
    console.log("Long Only checkbox found:", !!toggleLongOnlyCheckbox);
    if (toggleLongOnlyCheckbox) {
        toggleLongOnlyCheckbox.addEventListener("change", () => {
            console.log("Long Only checkbox changed");
            const data = getCurrentData();
            if (data)
                updateTableCallback(data);
        });
    }
}
// Update input fields from params
export function updateInputsFromParams(params) {
    const sma1Input = document.getElementById("sma1Periods");
    const sma2Input = document.getElementById("sma2Periods");
    const stdDevPeriodsInput = document.getElementById("stdDevPeriods");
    const stdDevCutOffInput = document.getElementById("stdDevCutOff");
    const longOnlyCheckbox = document.getElementById("toggleLongOnly");
    if (sma1Input)
        sma1Input.value = params.sma1Periods.toString();
    if (sma2Input)
        sma2Input.value = params.sma2Periods.toString();
    if (stdDevPeriodsInput)
        stdDevPeriodsInput.value = params.stdDevPeriods.toString();
    if (stdDevCutOffInput)
        stdDevCutOffInput.value = params.stdDevCutOff.toString();
    if (longOnlyCheckbox)
        longOnlyCheckbox.checked = params.longOnly;
}
// Save input fields to params
export function saveParamsFromInputs() {
    const sma1Input = document.getElementById("sma1Periods");
    const sma2Input = document.getElementById("sma2Periods");
    const stdDevPeriodsInput = document.getElementById("stdDevPeriods");
    const stdDevCutOffInput = document.getElementById("stdDevCutOff");
    const longOnlyCheckbox = document.getElementById("toggleLongOnly");
    let sma1 = parseFloat(sma1Input?.value) || 2;
    let sma2 = parseFloat(sma2Input?.value) || 11;
    // Ensure SMA2 >= SMA1 (SMA2 should be slower/longer-term)
    if (sma2 < sma1) {
        sma2 = sma1;
    }
    const params = {
        sma1Periods: sma1,
        sma2Periods: sma2,
        stdDevPeriods: parseInt(stdDevPeriodsInput?.value) || 3,
        stdDevCutOff: parseFloat(stdDevCutOffInput?.value) || 4.1,
        longOnly: longOnlyCheckbox?.checked ?? false,
    };
    console.log("TrendFollow saveParamsFromInputs:", params);
    return params;
}
