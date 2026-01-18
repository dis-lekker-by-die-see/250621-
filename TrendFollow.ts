// Type definitions
export type TradingPair = "FX_BTC_JPY" | "BTC_JPY";
export type OHLCEntry = [
  number, // timestamp
  number | null, // open
  number | null, // high
  number | null, // low
  number | null, // close
  number, // volume
  number, // ask
  number, // bid
  number, // sell volume
  number, // buy volume
];

export interface TrendFollowParams {
  sma1Periods: number;
  sma2Periods: number;
  stdDevPeriods: number;
  stdDevCutOff: number;
  longOnly: boolean;
}

export interface TrendFollowResult {
  sma1Values: (number | null)[];
  sma2Values: (number | null)[];
  stdDevValues: number[];
  SIDE: number[];
  positions: number[];
  plValues: number[];
  totalValues: number[];
}

// Default parameters for each trading pair
export const DEFAULT_PARAMS: Record<TradingPair, TrendFollowParams> = {
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
function calculateSMA1(data: OHLCEntry[], periods1: number): (number | null)[] {
  if (!data || data.length === 0) return [];
  const sma1: (number | null)[] = new Array(data.length).fill(null);
  if (data.length > 0) {
    sma1[data.length - 1] =
      data[data.length - 1][4] !== null
        ? Math.round(data[data.length - 1][4]!)
        : null;
    for (let i = data.length - 2; i >= 0; i--) {
      const currentClose = data[i][4];
      const prevSMA = sma1[i + 1];
      if (currentClose !== null && prevSMA !== null) {
        sma1[i] = Math.round(
          (prevSMA * (periods1 - 1) + currentClose) / periods1,
        );
      } else {
        sma1[i] = prevSMA;
      }
    }
  }
  return sma1;
}

function calculateSMA2(data: OHLCEntry[], periods2: number): (number | null)[] {
  if (!data || data.length === 0) return [];
  const sma2: (number | null)[] = new Array(data.length).fill(null);
  if (data.length > 0) {
    sma2[data.length - 1] =
      data[data.length - 1][4] !== null
        ? Math.round(data[data.length - 1][4]!)
        : null;
    for (let i = data.length - 2; i >= 0; i--) {
      const currentClose = data[i][4];
      const prevSMA = sma2[i + 1];
      if (currentClose !== null && prevSMA !== null) {
        sma2[i] = Math.round(
          (prevSMA * (periods2 - 1) + currentClose) / periods2,
        );
      } else {
        sma2[i] = prevSMA;
      }
    }
  }
  return sma2;
}

function calculateStdDev(data: OHLCEntry[], stdDevPeriods: number): number[] {
  if (!data || data.length === 0) return [];
  const stdDev: number[] = new Array(data.length).fill(0);
  for (let i = data.length - 1; i >= 0; i--) {
    let sum = 0;
    let count = 0;
    let values: number[] = [];
    for (
      let j = i;
      j < Math.min(data.length, i + Math.floor(stdDevPeriods));
      j++
    ) {
      const close = data[j][4];
      if (close !== 0 && close !== null) {
        sum += close;
        count++;
        values.push(close);
      }
    }
    if (count > 0) {
      const mean = sum / count;
      const varianceSum = values.reduce(
        (acc, val) => acc + Math.pow(val - mean, 2),
        0,
      );
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
export function calculateTrendFollowStrategy(
  data: OHLCEntry[],
  params: TrendFollowParams,
  isLongOnly?: boolean,
): TrendFollowResult {
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
  const SIDE: number[] = new Array(data.length).fill(0);
  const positions: number[] = new Array(data.length).fill(0);
  const plValues: number[] = new Array(data.length).fill(0);
  const totalValues: number[] = new Array(data.length).fill(0);
  let lastPosition = 0;
  let runningTotal = 0;

  // Calculate SIDE, positions, P/L, and total bottom up
  for (let i = data.length - 1; i >= 0; i--) {
    const row = data[i];
    // Step 1: SMA1 comparison
    if (
      i === data.length - 1 ||
      (sma1Values[i] ?? 0) > (sma1Values[i + 1] ?? 0)
    ) {
      SIDE[i] = 1; // Long
    } else {
      SIDE[i] = -1; // Short
    }

    // Step 2: STD DEV check
    if (stdDevValues[i] > params.stdDevCutOff) {
      SIDE[i] = 0; // No position
    }

    // Step 3: SMA1 vs SMA2 check
    if ((sma1Values[i] ?? 0) < (sma2Values[i] ?? 0)) {
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
      positions[i] = SIDE[i] === 0 ? 0 : (row[4] as number);
    } else {
      positions[i] = lastPosition;
    }
    lastPosition = positions[i];

    // Calculate P/L
    if (i < data.length - 1 && positions[i + 1] !== 0) {
      if (SIDE[i + 1] === 1) {
        plValues[i] = (row[4] as number) - positions[i + 1];
      } else if (SIDE[i + 1] === -1) {
        plValues[i] = positions[i + 1] - (row[4] as number);
      } else if (SIDE[i + 1] === 0) {
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
export function renderStrategyControls(pair?: TradingPair): string {
  const showLongOnly = pair !== "BTC_JPY";
  return `
    <div class="controls">
      <label for="sma1Periods">SMA1</label>
      <input type="number" id="sma1Periods" />

      <label for="sma2Periods">SMA2</label>
      <input type="number" id="sma2Periods" />
      <br />
      <label for="stdDevPeriods">StdDev</label>
      <input type="number" id="stdDevPeriods" step="1" />

      <label for="stdDevCutOff">CutOff</label>
      <input type="number" id="stdDevCutOff" step="0.1" />
    </div>
    <div>
      <label>
        <input type="checkbox" id="toggleColumns" unchecked />
        OHLC Columns
      </label>
      ${showLongOnly ? `<label>
        <input type="checkbox" id="toggleLongOnly" unchecked />
        Long Only
      </label>` : ''}
    </div>
  `;
}

// Render strategy table HTML
export function renderStrategyTable(): string {
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
export function renderTableRows(
  tbody: HTMLElement,
  data: OHLCEntry[],
  filledData: OHLCEntry[],
  result: TrendFollowResult,
  formatJstDate: (timestamp: number) => string,
  formatPrice: (value: number | null) => string,
): void {
  const {
    sma1Values,
    sma2Values,
    stdDevValues,
    SIDE,
    positions,
    plValues,
    totalValues,
  } = result;

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
}

// Toggle OHLC columns visibility
export function toggleColumns(): void {
  const toggleColumnsCheckbox = document.getElementById(
    "toggleColumns",
  ) as HTMLInputElement;
  const isChecked = toggleColumnsCheckbox?.checked ?? true;
  const extraColumns = document.querySelectorAll(".extra");
  extraColumns.forEach((col) => {
    (col as HTMLElement).style.display = isChecked ? "" : "none";
  });
}

// Setup strategy-specific event listeners
export function setupEventListeners(
  updateTableCallback: (data: OHLCEntry[]) => void,
  getCurrentData: () => OHLCEntry[] | null,
): void {
  console.log("TrendFollow setupEventListeners called");
  // Long Only toggle
  const toggleLongOnlyCheckbox = document.getElementById("toggleLongOnly");
  console.log("Long Only checkbox found:", !!toggleLongOnlyCheckbox);
  if (toggleLongOnlyCheckbox) {
    toggleLongOnlyCheckbox.addEventListener("change", () => {
      console.log("Long Only checkbox changed");
      const data = getCurrentData();
      if (data) updateTableCallback(data);
    });
  }
}

// Update input fields from params
export function updateInputsFromParams(params: TrendFollowParams): void {
  const sma1Input = document.getElementById("sma1Periods") as HTMLInputElement;
  const sma2Input = document.getElementById("sma2Periods") as HTMLInputElement;
  const stdDevPeriodsInput = document.getElementById(
    "stdDevPeriods",
  ) as HTMLInputElement;
  const stdDevCutOffInput = document.getElementById(
    "stdDevCutOff",
  ) as HTMLInputElement;
  const longOnlyCheckbox = document.getElementById("toggleLongOnly") as HTMLInputElement;

  if (sma1Input) sma1Input.value = params.sma1Periods.toString();
  if (sma2Input) sma2Input.value = params.sma2Periods.toString();
  if (stdDevPeriodsInput)
    stdDevPeriodsInput.value = params.stdDevPeriods.toString();
  if (stdDevCutOffInput)
    stdDevCutOffInput.value = params.stdDevCutOff.toString();
  if (longOnlyCheckbox) longOnlyCheckbox.checked = params.longOnly;
}

// Save input fields to params
export function saveParamsFromInputs(): TrendFollowParams {
  const sma1Input = document.getElementById("sma1Periods") as HTMLInputElement;
  const sma2Input = document.getElementById("sma2Periods") as HTMLInputElement;
  const stdDevPeriodsInput = document.getElementById(
    "stdDevPeriods",
  ) as HTMLInputElement;
  const stdDevCutOffInput = document.getElementById(
    "stdDevCutOff",
  ) as HTMLInputElement;
  const longOnlyCheckbox = document.getElementById("toggleLongOnly") as HTMLInputElement;

  const params = {
    sma1Periods: parseFloat(sma1Input?.value) || 2,
    sma2Periods: parseFloat(sma2Input?.value) || 11,
    stdDevPeriods: parseInt(stdDevPeriodsInput?.value) || 3,
    stdDevCutOff: parseFloat(stdDevCutOffInput?.value) || 4.1,
    longOnly: longOnlyCheckbox?.checked ?? false,
  };
  
  console.log("TrendFollow saveParamsFromInputs:", params);
  return params;
}
