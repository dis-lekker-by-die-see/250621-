// TrendHodl Strategy - Accumulation strategy using TrendFollow signals
// Enters positions on TrendFollow long signals, never exits, accumulates over time

// Type definitions
export type TradingPair = "BTC_JPY";

export type OHLCEntry = [number, number, number, number, number, number];

export interface TrendHodlParams {
  sma1Periods: number;
  sma2Periods: number;
  startDate: string; // YYYY-MM-DD format
  positionSizeYen: number;
}

export interface Position {
  tradeNo: number;
  date: string;
  timestamp: number;
  entryPrice: number;
  positionSize: number;
  pnl: number;
  totalPositionSize: number;
  totalPnl: number;
  totalValue: number;
  sma1: number | null;
  sma2: number | null;
}

export interface TrendHodlResult {
  positions: Position[];
}

// Minimum allowed start dates for each pair
const MIN_START_DATES: Record<TradingPair, string> = {
  BTC_JPY: "2015-06-24",
};

// Default parameters for each trading pair
export const DEFAULT_PARAMS: Record<TradingPair, TrendHodlParams> = {
  BTC_JPY: {
    sma1Periods: 2,
    sma2Periods: 11,
    startDate: "2015-06-24",
    positionSizeYen: 10000,
  },
};

export function getMinStartDate(pair: TradingPair): string {
  return MIN_START_DATES[pair];
}

// Helper function to calculate Simple Moving Average (same as TrendFollow)
function calculateSMA(data: OHLCEntry[], periods: number): (number | null)[] {
  if (!data || data.length === 0) return [];
  const sma: (number | null)[] = new Array(data.length).fill(null);
  if (data.length > 0) {
    sma[data.length - 1] =
      data[data.length - 1][4] !== null
        ? Math.round(data[data.length - 1][4]!)
        : null;
    for (let i = data.length - 2; i >= 0; i--) {
      const currentClose = data[i][4];
      const prevSMA = sma[i + 1];
      if (currentClose !== null && prevSMA !== null) {
        sma[i] = Math.round(
          (prevSMA * (periods - 1) + currentClose) / periods,
        );
      } else {
        sma[i] = prevSMA;
      }
    }
  }
  return sma;
}

// Calculate TrendHodl strategy
export function calculateTrendHodlStrategy(
  data: OHLCEntry[],
  params: TrendHodlParams,
  longOnly: boolean = false,
): TrendHodlResult {
  if (!data || data.length === 0) {
    return { positions: [] };
  }

  // Check which logic to use FIRST
  const useSlopeLogic = params.sma1Periods >= params.sma2Periods;

  // Calculate only what's needed
  const SMA1 = calculateSMA(data, params.sma1Periods);
  const SMA2 = useSlopeLogic ? [] : calculateSMA(data, params.sma2Periods);

  // Determine SIDE (position direction): 1 = long, 0 = flat
  const SIDE: number[] = [];

  for (let i = 0; i < data.length; i++) {
    if (SMA1[i] === null) {
      SIDE.push(0);
    } else if (useSlopeLogic) {
      // When sma1 >= sma2, ignore sma2 and use SMA1 slope: long when SMA rising
      // Data is newest-first, so i+1 is previous day
      if (i === data.length - 1 || SMA1[i + 1] === null) {
        SIDE.push(0); // No previous data to compare
      } else {
        SIDE.push(SMA1[i]! > SMA1[i + 1]! ? 1 : 0);
      }
    } else {
      // Crossover logic: long when SMA1 > SMA2
      if (SMA2[i] === null) {
        SIDE.push(0);
      } else {
        SIDE.push(SMA1[i]! > SMA2[i]! ? 1 : 0);
      }
    }
  }

  // Find all entry points (where SIDE changes to 1)
  // Loop bottom up (oldest to newest) to match TrendFollow logic
  const entryPoints: Array<{
    index: number;
    timestamp: number;
    entryPrice: number;
  }> = [];

  for (let i = SIDE.length - 1; i >= 0; i--) {
    // Entry detection: EXACTLY like TrendFollow position entry
    // Entry when: it's the last row OR SIDE changed from previous
    if (i === SIDE.length - 1 || SIDE[i] !== SIDE[i + 1]) {
      // Only record if SIDE is 1 (long position)
      if (SIDE[i] === 1) {
        const entryPrice = data[i][4] as number; // CLOSE price
        // console.log(
        //   `Entry found at i=${i}, date=${new Date(data[i][0]).toISOString()}, SIDE[i]=${SIDE[i]}, SIDE[i+1]=${i < SIDE.length - 1 ? SIDE[i + 1] : "N/A"}, price=${entryPrice}`,
        // );
        entryPoints.push({
          index: i,
          timestamp: data[i][0],
          entryPrice: entryPrice,
        });
      }
    }
  }

  console.log("Total entries found:", entryPoints.length);
  console.log(
    "First 5 entries:",
    entryPoints
      .slice(0, 5)
      .map((e) => ({ timestamp: e.timestamp, price: e.entryPrice })),
  );

  // Filter entry points by start date
  const startDateTimestamp = new Date(params.startDate).getTime();
  const filteredEntries = entryPoints.filter(
    (entry) => entry.timestamp >= startDateTimestamp,
  );

  console.log(
    "Filtered entries:",
    filteredEntries.length,
    "startDate:",
    params.startDate,
  );

  // Get latest close price for PnL calculation
  const latestClose = data[0][4] as number;

  // Build positions array in chronological order (oldest to newest)
  const positions: Position[] = [];
  let cumulativePositionSize = 0;
  let cumulativePnl = 0;

  // Process chronologically (filteredEntries is already oldest-first)
  filteredEntries.forEach((entry, idx) => {
    // Position size in BTC (or asset)
    const positionSize = params.positionSizeYen / entry.entryPrice;
    cumulativePositionSize += positionSize;

    // PnL for this position (rounded down)
    const pnl = Math.floor((latestClose - entry.entryPrice) * positionSize);
    cumulativePnl += pnl;

    // Total value: current market value of accumulated BTC holdings
    const totalValue = Math.floor(cumulativePositionSize * latestClose);

    // Format date
    const date = new Date(entry.timestamp);
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstTime = new Date(
      date.getTime() + jstOffset + date.getTimezoneOffset() * 60 * 1000,
    );
    const formattedDate = `${jstTime.getFullYear()}-${String(jstTime.getMonth() + 1).padStart(2, "0")}-${String(jstTime.getDate()).padStart(2, "0")} ${String(jstTime.getHours()).padStart(2, "0")}:${String(jstTime.getMinutes()).padStart(2, "0")}`;

    positions.push({
      tradeNo: idx + 1, // Trade #1 = oldest, chronologically first
      date: formattedDate,
      timestamp: entry.timestamp,
      entryPrice: entry.entryPrice,
      positionSize: positionSize,
      pnl: pnl,
      totalPositionSize: cumulativePositionSize, // Accumulates chronologically
      totalPnl: Math.floor(cumulativePnl),
      totalValue: totalValue,
      sma1: SMA1[entry.index],
      sma2: useSlopeLogic ? null : SMA2[entry.index],
    });
  });

  // Reverse to show newest first in table
  positions.reverse();

  return { positions };
}

// Render strategy controls HTML
export function renderStrategyControls(pair?: TradingPair): string {
  // Only show controls for BTC_JPY
  if (pair !== "BTC_JPY") {
    return ``;
  }

  return `
    <div class="controls">
      <label for="sma1Periods">SMA1</label>
      <input type="number" id="sma1Periods" min="1" />

      <label for="sma2Periods">SMA2</label>
      <input type="number" id="sma2Periods" min="1" />
      <br />
      <label for="startDate">Start Date</label>
      <input type="date" id="startDate" />

      <label for="positionSizeYen">Position Size (¥)</label>
      <input type="number" id="positionSizeYen" step="1000" min="0" />
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
            <th>Trade No</th>
            <th>Date</th>
            <th>Position</th>
            <th>Position Size</th>
            <th>PnL</th>
            <th>Total Position Size</th>
            <th>Total PnL</th>
            <th>Capital Value</th>
            <th>SMA1</th>
            <th>SMA2</th>
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
  result: TrendHodlResult,
  formatJstDate: (timestamp: number) => string,
  formatPrice: (value: number | null) => string,
  pair?: TradingPair,
): void {
  // Show message for unsupported pairs
  if (pair !== "BTC_JPY") {
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td colspan="100" style="text-align: center; padding: 20px; font-style: italic; color: #666;">No Strategy Defined</td>';
    tbody.appendChild(tr);
    return;
  }

  const { positions } = result;

  positions.forEach((position: Position) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${position.tradeNo}</td>
      <td>${position.date}</td>
      <td>${formatPrice(position.entryPrice)}</td>
      <td>${position.positionSize.toFixed(8)}</td>
      <td>${formatPrice(position.pnl)}</td>
      <td>${position.totalPositionSize.toFixed(8)}</td>
      <td>${formatPrice(position.totalPnl)}</td>
      <td>${formatPrice(position.totalValue)}</td>
      <td>${formatPrice(position.sma1)}</td>
      <td>${position.sma2 !== null ? formatPrice(position.sma2) : "-"}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Note: Event listeners are handled by script.js attachStrategyEventListeners()
// No need for strategy-specific setupEventListeners for TrendHodl

// Update input fields from params
export function updateInputsFromParams(params: TrendHodlParams): void {
  const sma1Input = document.getElementById("sma1Periods") as HTMLInputElement;
  const sma2Input = document.getElementById("sma2Periods") as HTMLInputElement;
  const startDateInput = document.getElementById(
    "startDate",
  ) as HTMLInputElement;
  const positionSizeYenInput = document.getElementById(
    "positionSizeYen",
  ) as HTMLInputElement;

  if (sma1Input) sma1Input.value = params.sma1Periods.toString();
  if (sma2Input) sma2Input.value = params.sma2Periods.toString();
  if (startDateInput) startDateInput.value = params.startDate;
  if (positionSizeYenInput)
    positionSizeYenInput.value = params.positionSizeYen.toString();
}

// Save input fields to params
export function saveParamsFromInputs(): TrendHodlParams {
  const sma1Input = document.getElementById("sma1Periods") as HTMLInputElement;
  const sma2Input = document.getElementById("sma2Periods") as HTMLInputElement;
  const startDateInput = document.getElementById(
    "startDate",
  ) as HTMLInputElement;
  const positionSizeYenInput = document.getElementById(
    "positionSizeYen",
  ) as HTMLInputElement;

  let sma1 = parseFloat(sma1Input?.value) || 2;
  let sma2 = parseFloat(sma2Input?.value) || 11;

  // Ensure SMA2 >= SMA1 (SMA2 should be slower/longer-term)
  if (sma2 < sma1) {
    sma2 = sma1;
  }

  return {
    sma1Periods: sma1,
    sma2Periods: sma2,
    startDate: startDateInput?.value || "2015-11-18",
    positionSizeYen: parseFloat(positionSizeYenInput?.value) || 10000,
  };
}
