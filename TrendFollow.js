// Default parameters for each trading pair
export const DEFAULT_PARAMS = {
    FX_BTC_JPY: {
        sma1Periods: 2,
        sma2Periods: 11,
        stdDevPeriods: 3,
        stdDevCutOff: 4.1,
    },
    BTC_JPY: {
        sma1Periods: 2,
        sma2Periods: 11,
        stdDevPeriods: 3,
        stdDevCutOff: 4.1,
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
    const sma1Values = calculateSMA1(data, params.sma1Periods);
    const sma2Values = calculateSMA2(data, params.sma2Periods);
    const stdDevValues = calculateStdDev(data, params.stdDevPeriods);
    const SIDE = new Array(data.length).fill(0);
    const positions = new Array(data.length).fill(0);
    const plValues = new Array(data.length).fill(0);
    const totalValues = new Array(data.length).fill(0);
    let lastPosition = 0;
    let runningTotal = 0;
    // Calculate SIDE, positions, P/L, and total bottom up
    for (let i = data.length - 1; i >= 0; i--) {
        const row = data[i];
        // Step 1: SMA1 comparison
        if (i === data.length - 1 ||
            (sma1Values[i] ?? 0) > (sma1Values[i + 1] ?? 0)) {
            SIDE[i] = 1; // Long
        }
        else {
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
export function renderStrategyControls() {
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
      <label>
        <input type="checkbox" id="toggleLongOnly" unchecked />
        Long Only
      </label>
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
