export let config = {
  baseURL:
    "https://script.google.com/macros/s/AKfycbxSuThURHaBMMi283lvhZcI0Q4gAsKBuAVSWN3bA4_JCrSmBnTAVYE0_yOJMXUTGlgUMg/exec",
  defaultLeaderboard: "leaderboards-G56K66",
};
let originalLeaderboardGrid = [];

// Fetches the button configuration from the remote API that now returns JSON.
export async function fetchButtonConfig() {
  try {
    // Use the imported config directly
    const baseURL = config.baseURL.trim();

    // Append the query string for the button layout
    const configURL = `${baseURL}?sheets=buttonLayout`;
    console.log("Fetching button configuration from:", configURL);

    // Fetch the JSON from the remote URL
    const response = await fetch(configURL);
    const jsonData = await response.json();

    // Extract the button layout from the returned JSON.
    // Expected format: { "buttonLayout": { "A1": "Notes", "B1": "Some header", ... } }
    const buttonLayout = jsonData.buttonLayout;
    console.log("Button configuration JSON received:", buttonLayout);

    return buttonLayout;
  } catch (error) {
    console.error("Error fetching button configuration:", error);
    return null;
  }
}

/**
 * Parses the full sheet JSON into a grid, then extracts:
 * 1. Page title: from cell B2 (row 2, column B).
 * 2. External links: from row 3 (index 1), skipping column A.
 * 3. Button table data: from row 2 onward (index 2+), also skipping column A.
 */
export function parseSheetData(sheetJson) {
  if (!sheetJson) {
    console.error("No sheet JSON provided.");
    return { externalLinks: [], tableData: [] };
  }

  // Determine grid dimensions.
  let maxRow = 0;
  let maxCol = 0;
  for (const cellKey in sheetJson) {
    const match = cellKey.match(/^([A-Z]+)(\d+)$/);
    if (match) {
      const row = parseInt(match[2], 10);
      if (row > maxRow) maxRow = row;
      const colNum = columnLetterToNumber(match[1]);
      if (colNum > maxCol) maxCol = colNum;
    }
  }

  // Build a full grid (zero-indexed). Any cell not defined becomes an empty string.
  const grid = Array.from({ length: maxRow }, () => Array(maxCol).fill(""));
  for (const cellKey in sheetJson) {
    const match = cellKey.match(/^([A-Z]+)(\d+)$/);
    if (match) {
      const row = parseInt(match[2], 10);
      const colNum = columnLetterToNumber(match[1]);
      grid[row - 1][colNum - 1] = sheetJson[cellKey];
    }
  }

  // Update the page title with text from cell B2 (row 2, column B).
  updatePageTitle(grid[1][1]);

  // External links are now on row 3 (index 2) excluding column A.
  const externalLinksRaw = grid[2].slice(1);
  const externalLinks = externalLinksRaw
    .map((cellValue) => {
      try {
        return JSON.parse(cellValue);
      } catch (e) {
        console.error("Error parsing external link JSON:", cellValue, e);
        return null;
      }
    })
    .filter((linkObj) => linkObj !== null);

  // Button table data is from row 4 onward (index 3+), skipping column A.
  const tableData = grid.slice(3).map((row) => row.slice(1));
  console.log("External links:", externalLinks);
  console.log("Button table data:", tableData);
  return { externalLinks, tableData };
}

export function updatePageTitle(titleText) {
  const titleElement = document.querySelector("h1.page-title");
  if (titleElement) {
    titleElement.textContent = titleText;
  }
}

// Converts a column letter (e.g., "A") to a 1-based index (1 for "A", 2 for "B", etc.).
function columnLetterToNumber(column) {
  let result = 0;
  for (let i = 0; i < column.length; i++) {
    result *= 26;
    result += column.charCodeAt(i) - 64; // 'A' is 65
  }
  return result;
}

// Builds the button structure from the parsed data array-of-arrays.
export function buildButtonStructure(parsedData) {
  if (!parsedData || parsedData.length < 2) {
    console.error("No valid button configuration data available.");
    return;
  }

  // Assume the first row contains headers.
  const headers = parsedData[0];
  const idxButtonID = headers.indexOf("Button ID");
  const idxParentID = headers.indexOf("Parent ID");
  const idxButtonLabel = headers.indexOf("Button Label");
  const idxData = headers.indexOf("Data");
  const idxAction = headers.indexOf("Action");

  if (
    idxButtonID === -1 ||
    idxParentID === -1 ||
    idxButtonLabel === -1 ||
    idxData === -1 ||
    idxAction === -1
  ) {
    console.error("Missing required headers in configuration data.");
    return;
  }

  // Group rows into root buttons and child buttons.
  const childButtonsByParent = {};
  const rootButtons = [];

  for (let i = 1; i < parsedData.length; i++) {
    const row = parsedData[i];
    if (!row || row.length < headers.length) continue;

    const buttonID = row[idxButtonID].trim();
    const parentID = row[idxParentID].trim();
    const buttonLabel = row[idxButtonLabel].trim();
    const data = row[idxData].trim();
    const action = row[idxAction].trim();

    const buttonObj = { buttonID, parentID, buttonLabel, data, action };

    if (parentID.toUpperCase() === "ROOT") {
      rootButtons.push(buttonObj);
    } else {
      if (!childButtonsByParent[parentID]) {
        childButtonsByParent[parentID] = [];
      }
      childButtonsByParent[parentID].push(buttonObj);
    }
  }

  // Use the existing leaderboard-buttons container for root buttons.
  let rootContainer = document.querySelector(".leaderboard-buttons");
  if (!rootContainer) {
    rootContainer = document.createElement("div");
    rootContainer.className = "leaderboard-buttons";
    document.body.appendChild(rootContainer);
  }
  rootContainer.innerHTML = ""; // Overwrite existing content.

  // Create (or get) a global container for child menus.
  let globalChildContainer = document.getElementById("child-button-container");
  if (!globalChildContainer) {
    globalChildContainer = document.createElement("div");
    globalChildContainer.id = "child-button-container";
    globalChildContainer.style.marginTop = "1rem";
    // Insert global child container after the root container.
    rootContainer.parentNode.insertBefore(
      globalChildContainer,
      rootContainer.nextSibling
    );
  }
  globalChildContainer.innerHTML = ""; // Clear existing child menus

  // Utility: Clear any child containers deeper than a given level.
  function clearDeeperLevels(level) {
    const containers = globalChildContainer.querySelectorAll("[data-level]");
    containers.forEach((cont) => {
      if (parseInt(cont.getAttribute("data-level"), 10) > level) {
        cont.remove();
      }
    });
  }

  // Recursive function to render buttons for a given parent, within a container.
  function renderButtons(buttons, level, container) {
    // Create a new container for this level.
    const levelContainer = document.createElement("div");
    levelContainer.setAttribute("data-level", level);
    container.appendChild(levelContainer);

    buttons.forEach((button) => {
      const btn = document.createElement("button");
      btn.textContent = button.buttonLabel;
      btn.dataset.buttonId = button.buttonID;
      btn.classList.add("child");
      levelContainer.appendChild(btn);

      btn.addEventListener("click", () => {
        // Clear any containers deeper than the current level.
        clearDeeperLevels(level);
        // Remove selected state from all buttons in this container.
        Array.from(levelContainer.getElementsByTagName("button")).forEach((b) =>
          b.classList.remove("selected")
        );
        btn.classList.add("selected");

        // Check if this button has children.
        const children = childButtonsByParent[button.buttonID];
        if (children && children.length > 0) {
          // Recursively render the child buttons in the global child container.
          renderButtons(children, level + 1, globalChildContainer);
        } else if (button.action.toLowerCase() === "load data") {
          loadLeaderboardData(button.data);
        } else {
          console.log(
            `No recognized action for ${button.buttonLabel}: ${button.action}`
          );
        }
      });
    });
  }

  // Render root buttons in the root container (level 0).
  rootButtons.forEach((button) => {
    const btn = document.createElement("button");
    btn.textContent = button.buttonLabel;
    btn.dataset.buttonId = button.buttonID;
    btn.classList.add("root");
    rootContainer.appendChild(btn);

    btn.addEventListener("click", () => {
      // Clear selected state in root container.
      Array.from(rootContainer.getElementsByTagName("button")).forEach((b) =>
        b.classList.remove("selected")
      );
      btn.classList.add("selected");

      // Clear all child containers.
      globalChildContainer.innerHTML = "";

      // Check if this root button has children.
      const children = childButtonsByParent[button.buttonID];
      if (children && children.length > 0) {
        renderButtons(children, 1, globalChildContainer);
      } else if (button.action.toLowerCase() === "load data") {
        loadLeaderboardData(button.data);
      } else {
        console.log(
          `No recognized action for ${button.buttonLabel}: ${button.action}`
        );
      }
    });
  });
}

/**
 * Updates the .top-links container with external link buttons.
 *
 * Each external link object should include:
 *  - "label": The text to display on the button.
 *  - "link": The URL the button should link to.
 *
 * Optionally, an external link object may include:
 *  - "text": A text color for the button label. If provided, this value will be applied to the link text.
 *  - "colour": The background color for the button. Accepts any valid CSS color format (e.g., named colors, hex codes, or rgb(...)).
 *
 * If the "text" property is missing, the link's text will use the default styling.
 * Example object: {"label":"test","colour":"yellow","text":"black","link":"https://www.example.com"}
 *
 * @param {Array} links - An array of external link objects.
 */
export function updateTopLinks(links) {
  const container = document.querySelector(".top-links");
  if (!container) {
    console.error("No .top-links container found.");
    return;
  }
  container.innerHTML = ""; // Clear current content

  links.forEach((linkObj) => {
    const a = document.createElement("a");
    a.textContent = linkObj.label;
    a.href = linkObj.link;

    // Only set the background color if `colour` is specified
    if (linkObj.colour) {
      a.style.backgroundColor = linkObj.colour;
    }

    // Optionally set the text colour if provided
    if (linkObj.text) {
      a.style.color = linkObj.text;
    }

    container.appendChild(a);
  });
}

/**
 * Load data from the remote API for a given sheet.
 *
 * This function uses the baseURL saved in the config object and concatenates it with
 * "?sheets=" + dataKey, where dataKey is the string from the "Data" column for the pressed button.
 * It then makes a GET request to that URL, expecting a JSON response in the form:
 *
 * {
 *   "sheetName": {
 *     "A1": "Header1",
 *     "B1": "Header2",
 *     ...,
 *     "A2": "Row1Col1",
 *     "B2": "Row1Col2",
 *     ...
 *   }
 * }
 *
 * The sheet data is converted to a 2D array and then used to update the leaderboard table.
 *
 * @param {string} dataKey - The string from the button's "Data" column.
 */
export function loadLeaderboardData(dataKey) {
  const baseURL = config.baseURL.trim();
  const url = `${baseURL}?sheets=${dataKey}`;
  console.log("Fetching data from:", url);

  // Immediately update the table to a loading placeholder.
  showLoadingPlaceholder();

  fetch(url)
    .then((response) => response.json())
    .then((jsonData) => {
      console.log("Data received:", jsonData);
      const sheetName = Object.keys(jsonData)[0];
      const sheetData = jsonData[sheetName];
      const grid = convertSheetDataToGrid(sheetData);

      // Save the grid globally so it can be used for filtering later.
      originalLeaderboardGrid = grid;

      // Update the leaderboard table with the new grid data.
      updateLeaderboardTable(grid);
    })
    .catch((error) => {
      console.error("Error in loadLeaderBoardData:", error);
      showErrorPlaceholder(error.message || "Unknown error");
    });
}

/**
 * Filters the leaderboard grid based on one or more keywords and updates the table.
 *
 * The function splits the input string on commas, trims each keyword, and then searches
 * through each data row (excluding the header row) for any occurrence of any keyword (case-insensitive).
 * Rows that do not contain any of the keywords are filtered out. The header row is preserved.
 *
 * @param {string} keywordString - A comma-separated string of keywords to filter by.
 */
export function filterLeaderboardData(keywordString) {
  if (!originalLeaderboardGrid || originalLeaderboardGrid.length === 0) {
    console.warn("No leaderboard data available to filter.");
    return;
  }

  // Split the input string by commas, trim each keyword, and convert to lowercase.
  const keywords = keywordString
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k !== "");

  // If no valid keywords are provided, show the original table.
  if (keywords.length === 0) {
    updateLeaderboardTable(originalLeaderboardGrid);
    return;
  }

  // Preserve the header row.
  const headerRow = originalLeaderboardGrid[0];

  // Filter data rows (starting from index 1) if any cell contains any of the keywords.
  const filteredRows = originalLeaderboardGrid.slice(1).filter((row) => {
    return row.some((cell) => {
      const cellLower = cell.toLowerCase();
      return keywords.some((kw) => cellLower.includes(kw));
    });
  });

  // Build a new grid including the header row and the filtered data rows.
  const filteredGrid = [headerRow, ...filteredRows];

  // Update the leaderboard table with the filtered grid.
  updateLeaderboardTable(filteredGrid);
}

/**
 * Displays a loading placeholder in the leaderboard table.
 * This immediately clears the table and shows a message so the user knows the data is updating.
 */
function showLoadingPlaceholder() {
  const table = document.querySelector("table");
  if (!table) {
    console.error("No table found.");
    return;
  }
  table.innerHTML = ""; // Clear the table content

  // Create a placeholder row.
  const tbody = document.createElement("tbody");
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.textContent = "Loading data...";
  // Use a large colspan to span the full table width.
  td.setAttribute("colspan", "100");
  tr.appendChild(td);
  tbody.appendChild(tr);
  table.appendChild(tbody);
}

/**
 * Displays an error message in the leaderboard table.
 * This clears the table and shows the provided error message so the user knows the data failed to load.
 *
 * @param {string} errorMessage - The error message to display.
 */
function showErrorPlaceholder(errorMessage) {
  const table = document.querySelector("table");
  if (!table) {
    console.error("No table found.");
    return;
  }
  table.innerHTML = ""; // Clear the table content

  // Create a row to display the error message.
  const tbody = document.createElement("tbody");
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.textContent = `Error loading table: ${errorMessage}. Please check data formatting or range errors.`;
  // Use a large colspan to span the full table width.
  td.setAttribute("colspan", "100");
  td.style.color = "red"; // Optional: display error message in red
  tr.appendChild(td);
  tbody.appendChild(tr);
  table.appendChild(tbody);
}

/**
 * Converts a sheet data object (mapping cell addresses like "A1" to values)
 * into a 2D array (grid) based on the maximum row and column.
 *
 * @param {Object} sheetData - An object with keys like "A1", "B1", etc.
 * @returns {Array[]} A 2D array representing the grid of data.
 */
function convertSheetDataToGrid(sheetData) {
  let maxRow = 0;
  let maxCol = 0;
  // Determine the grid dimensions.
  for (const cellKey in sheetData) {
    const match = cellKey.match(/^([A-Z]+)(\d+)$/);
    if (match) {
      const row = parseInt(match[2], 10);
      if (row > maxRow) maxRow = row;
      const colNum = columnLetterToNumber(match[1]);
      if (colNum > maxCol) maxCol = colNum;
    }
  }

  // Create a grid (2D array) filled with empty strings.
  const grid = Array.from({ length: maxRow }, () => Array(maxCol).fill(""));
  // Populate the grid with the sheet data.
  for (const cellKey in sheetData) {
    const match = cellKey.match(/^([A-Z]+)(\d+)$/);
    if (match) {
      const row = parseInt(match[2], 10);
      const colNum = columnLetterToNumber(match[1]);
      grid[row - 1][colNum - 1] = sheetData[cellKey];
    }
  }
  return grid;
}

/**
 * Updates the leaderboard table with the provided grid data.
 *
 * - The first row of the grid is used as the table headers.
 * - An extra "Rank" column is added at the start to display each row's ranking (starting at 1).
 * - For each data cell, if the value starts with "http" or "https", it is rendered as a hyperlink with the text "Link".
 *
 * @param {Array[]} grid - A 2D array where grid[0] contains headers.
 */
function updateLeaderboardTable(grid) {
  const table = document.querySelector("table");
  if (!table) {
    console.error("No table found in the document.");
    return;
  }

  // Clear the table.
  table.innerHTML = "";

  // Create and populate the table header.
  const thead = document.createElement("thead");
  const headerRow = grid[0];
  const trHeader = document.createElement("tr");

  // Add "Rank" header as the first column.
  const thRank = document.createElement("th");
  thRank.textContent = "Rank";
  trHeader.appendChild(thRank);

  // Create header cells from the grid.
  headerRow.forEach((cellValue) => {
    const th = document.createElement("th");
    th.textContent = cellValue;
    trHeader.appendChild(th);
  });
  thead.appendChild(trHeader);
  table.appendChild(thead);

  // Create and populate the table body.
  const tbody = document.createElement("tbody");
  // Process each data row (starting at index 1).
  for (let i = 1; i < grid.length; i++) {
    const row = grid[i];
    const tr = document.createElement("tr");

    // Insert rank cell (row number).
    const tdRank = document.createElement("td");
    tdRank.textContent = i; // Ranking starts at 1 for the first data row.
    tr.appendChild(tdRank);

    row.forEach((cellValue) => {
      const td = document.createElement("td");
      const trimmedValue = cellValue.trim();
      // Render URLs as hyperlinks with the text "Link".
      if (/^https?:\/\//i.test(trimmedValue)) {
        const a = document.createElement("a");
        a.href = trimmedValue;
        a.textContent = "Link";
        a.target = "_blank"; // Open in a new tab.
        a.title = trimmedValue; // This line adds the tooltip to display the full URL.
        td.appendChild(a);
      } else {
        td.textContent = cellValue;
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
}
