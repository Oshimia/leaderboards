# Google Sheets HTTP Requests Extension Code

This document provides both the extension code and an explanation of how it works. The code is written in Google Apps Script and is designed to be deployed as a web app, allowing external services to fetch and format data from a Google Spreadsheet. This could be attached to Mininet's Sheet: [Mininet's Sheet](https://docs.google.com/spreadsheets/d/10Ivfhuer7AyLxQXPIuvLRGigui5-Z2G-gEFk3xWBir4/edit?gid=1617442120#gid=1617442120), but would enforce restrictions on data manipulation for better human legibility, it is instead attached to a duplicate sheet formatted for easy data requests: [Data Sheet](https://docs.google.com/spreadsheets/d/1RkrBjEuuM86vHCHZQgocjOg08XygcqV61lxGe5MNpjk/edit?usp=sharing).

To use this code you will need to save it under **extensions > App Script** in your Google Spreadsheet. Once saved, deploy it as a web app and copy the base URL into your configuration file.

---

## Extension Code

```javascript
// Deployment ID: SAVE_YOUR_DEPLOYMENT_ID_HERE
// Deployment URL: SAVE_YOUR_DEPLOYMENT_URL_HERE
// Usage: {baseUrl}?sheets={sheetNameWithOptionalRange},{sheetNameWithOptionalRange}
function doGet(e) {
  const sheetRequests = e.parameter.sheets.split(','); // Get multiple sheet requests from URL parameter
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let allData = {};

  sheetRequests.forEach(request => {
    // Split the request into sheet name and optional range (delimited by a dash)
    const [sheetName, rangeStr] = request.split('-');
    const sheet = spreadsheet.getSheetByName(sheetName);
    
    // Create a unique key for this request
    const responseKey = rangeStr ? `${sheetName}-${rangeStr}` : sheetName;
    
    if (!sheet) {
      allData[responseKey] = { error: 'Sheet not found' };
    } else {
      // Use the default range of A1:Z10000 to accommodate leaderboards with many thousands of rows.
      // This larger range ensures sufficient rows are checked.
      const range = rangeStr ? parseRange(sheet, rangeStr) : sheet.getRange("A1:Z10000");
      const data = range.getValues();
      
      // HEADER_CHECK_LIMIT: number of rows to check for a header in each column.
      // We limit the check to improve performance, as headers typically reside in the top few rows.
      const HEADER_CHECK_LIMIT = 10;
      
      // EMPTY_ROW_LIMIT: if this many consecutive rows are empty, assume all following rows are empty.
      // This helps avoid scanning thousands of rows unnecessarily.
      const EMPTY_ROW_LIMIT = 10;
      
      // Determine which columns are considered empty based on the first HEADER_CHECK_LIMIT rows.
      let emptyColumns = new Array(data[0].length).fill(true);
      for (let j = 0; j < data[0].length; j++) {
        for (let i = 0; i < Math.min(HEADER_CHECK_LIMIT, data.length); i++) {
          if (data[i][j] !== null && data[i][j] !== "") {
            emptyColumns[j] = false;
            break;
          }
        }
      }
      
      let sheetData = {};
      let consecutiveEmptyRows = 0;
      
      // Loop over rows and process them. If we encounter EMPTY_ROW_LIMIT consecutive empty rows, break the loop.
      for (let i = 0; i < data.length; i++) {
        if (data[i].every(cell => cell === null || cell === "")) {
          consecutiveEmptyRows++;
          if (consecutiveEmptyRows >= EMPTY_ROW_LIMIT) {
            break; // Assume all following rows are empty
          }
          continue;
        } else {
          consecutiveEmptyRows = 0;
        }
        
        // Loop over columns in the row
        for (let j = 0; j < data[i].length; j++) {
          // Skip if this column is considered empty based on the header check
          if (emptyColumns[j]) {
            continue;
          }
          
          let cell = data[i][j];
          if (cell === null || cell === "") {
            cell = "";
          } else if (Object.prototype.toString.call(cell) === "[object Date]" && !isNaN(cell.getTime())) {
            cell = formatDate(cell);
          } else {
            cell = cell.toString();
          }
          // Build the location key (e.g., "A1", "B2", etc.)
          let cellKey = numberToColumnLetter(j + 1) + (i + 1);
          sheetData[cellKey] = cell;
        }
      }
      
      allData[responseKey] = sheetData;
    }
  });

  // Return the JSON response. JSON.stringify will automatically escape any special characters.
  return ContentService.createTextOutput(JSON.stringify(allData))
    .setMimeType(ContentService.MimeType.JSON);
}

function parseRange(sheet, rangeStr) {
  // Expected format: e.g., A1B2 (without a colon or separator)
  if (!rangeStr.match(/^[A-Z]+\d+[A-Z]+\d+$/)) {
    throw new Error('Invalid range format. Expected format: A1B2');
  }
  
  const match = rangeStr.match(/^([A-Z]+)(\d+)([A-Z]+)(\d+)$/);
  const [_, startCol, startRow, endCol, endRow] = match;
  
  return sheet.getRange(
    parseInt(startRow),
    columnLetterToNumber(startCol),
    parseInt(endRow) - parseInt(startRow) + 1,
    columnLetterToNumber(endCol) - columnLetterToNumber(startCol) + 1
  );
}

function columnLetterToNumber(column) {
  let result = 0;
  for (let i = 0; i < column.length; i++) {
    result *= 26;
    result += column.charCodeAt(i) - 'A'.charCodeAt(0) + 1;
  }
  return result;
}

function numberToColumnLetter(n) {
  let result = '';
  while (n > 0) {
    let mod = (n - 1) % 26;
    result = String.fromCharCode(65 + mod) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function formatDate(date) {
  // Format date as "dd/MMM/yy" (e.g., "05/JAN/23")
  const day = ("0" + date.getDate()).slice(-2);
  const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const year = date.getFullYear().toString().slice(-2);
  return day + '/' + month + '/' + year;
}
```

---

## Explanation of the Code

### Overview

**Purpose:**
- This script serves as a web endpoint for retrieving data from specified sheets within a Google Spreadsheet.
- It processes HTTP GET requests by reading a query parameter named sheets, which contains one or more sheet requests. Each request can specify just a sheet name (e.g., Sheet1) or a sheet name with a custom range (e.g., Sheet1-A1B2).
- The script converts the data into a JSON object. Each cell’s content is stored using its cell address (e.g., "A1", "B2") as the key, which makes it easy to look up specific cell values in downstream processing.

**Deployment Context:**
- The code is intended to be saved in the Google Apps Script associated with your Google Spreadsheet.
- Once deployed as a web app, external services can query the spreadsheet by constructing URLs with the appropriate parameters.
- The deployment URL is then stored in your configuration file (in `functions.js` or equivalent) under the `baseURL` property.

### Detailed Code Breakdown

#### 1. `doGet(e)`

- **Input Handling:**
  - The function expects an HTTP GET request with a query parameter named `sheets`.
  - The `sheets` parameter should be a comma-separated list where each item is either a sheet name (e.g., `Sheet1`) or a sheet name with an optional range (e.g., `Sheet1-A1B10`).

- **Processing Steps:**
  1. **Parameter Parsing:**
     - The `sheets` parameter is split by commas to obtain an array of sheet requests.
     - Each request is further split on the dash (`-`) to separate the sheet name from an optional range string.
  
  2. **Sheet Retrieval and Range Determination:**
     - The script retrieves the sheet using `SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName)`.
     - If a range string is provided, the `parseRange` function is called to convert it to a range object; otherwise, a default range (`"A1:K1000"`) is used.

  3. **Data Extraction and Processing:**
     - Data is obtained using `range.getValues()`, which returns a 2D array.
     - It first scans the first few rows (limited by HEADER_CHECK_LIMIT) to determine which columns are entirely empty—this helps avoid processing columns without any header or content.
     - It then iterates through each row. If a row is completely empty (i.e., every cell is null or an empty string), it increases a counter and discards it. After a preset number of consecutive empty rows (defined by EMPTY_ROW_LIMIT), the script stops processing further rows.
     - Each remaining row is processed:
       - Empty cells are converted to `""`.
       - Date cells are formatted using `formatDate(date)`.
       - Other cells are converted to strings, and any internal double quotes are escaped by doubling them. The entire cell value is then wrapped in double quotes, ensuring CSV compatibility.
     - It then generates a cell address (for example, "A1" or "B2") using a helper function (numberToColumnLetter) and stores the cell’s value in a JSON object (sheetData) keyed by this address.

  4. **Response Construction:**
     - The JSON object for each sheet or sheet-range request (contained in sheetData) is added to a master object (allData) under its unique response key.
     - Finally, the entire allData object is serialized to JSON and returned as the HTTP response using the ContentService with the MIME type set to JSON.

#### 2. `parseRange(sheet, rangeStr)`

- **Purpose:**
  - Converts a range string formatted like `A1B2` (without a colon or separator) into a Google Sheets range object.
  
- **Operation:**
  - Validates the format of the range string using a regular expression.
  - Extracts the start and end columns and rows.
  - Converts column letters to numeric indices with the help of the `columnLetterToNumber` function.
  - Calculates the number of rows and columns, then uses `sheet.getRange()` to return the corresponding range.
  
- **Error Handling:**
  - Throws a descriptive error if the range string does not match the expected format or if range retrieval fails.

#### 3. `columnLetterToNumber(column)`

- **Purpose:**
  - Converts a column letter (or letters) into its corresponding numeric index (e.g., "A" becomes 1, "B" becomes 2, "AA" becomes 27).
  
- **Operation:**
  - Iterates over each character in the column string, calculates its numeric value using ASCII codes, and accumulates the result to obtain the final column index.

#### 4. `numberToColumnLetter(n)`

- **Purpose:** 
  - Converts a numeric index to its corresponding column letter (e.g., 1 to "A", 27 to "AA").

- **Operation**
  - Converts a numeric index into its corresponding Excel-style column letters using base-26 arithmetic.

#### 5. `formatDate(date)`

- **Purpose:**
  - Formats a JavaScript `Date` object into a string with the format `DD/MMM/YY` (for example, `"03/JUN/23"`), ensuring that it is wrapped in quotes for CSV compatibility.
  
- **Operation:**
  - Extracts the day (with leading zero if necessary), the abbreviated month in uppercase, and the last two digits of the year.
  - Combines these components into the formatted date string.

---

### Summary

- **Endpoint Setup:**  
  The `doGet(e)` function is the entry point for HTTP GET requests. It processes the `sheets` parameter to determine which sheet(s) and ranges to retrieve.

- **Data Processing:**  
  This updated script converts selected cell data from a Google Spreadsheet into a JSON object. Each cell’s value is mapped by its cell address (for example, "A1", "B2"), and only non-empty cells (in columns determined to have headers) are included.

- **Response Formation:**  
  The processed data is organized into a JSON object, where each key corresponds to a specific sheet or sheet-range request. This JSON response is then sent back to the requester.

- **Deployment:**  
  After saving this code in Google Apps Script, deploy it as a web app. The deployment URL should be updated in your configuration file so that external services can query your spreadsheet data.

*End of Documentation*
