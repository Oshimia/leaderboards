# Leaderboards

Leaderboards is a website that uses a Google Sheets document as a simple interface and data storage solution to create personalized leaderboards. By using a Google Apps Script extension, your spreadsheet data is exported to your website in a user-friendly format.This is designed so that you don't need any coding knowledge or experience, just follow the instructions and add your information to a Google Sheet to create your own free leaderboard website. 

## Getting Started

1. **Clone the Repository:**  
   Start by cloning this repository to your own github profile.

2. **Set Up the Google Sheets Extension:**  
   - Follow the instructions in [Google Sheets Extension Setup](https://github.com/Oshimia/leaderboards/blob/main/docs/googleSheetsExtension.md) and [Google Sheets Setup](https://github.com/Oshimia/leaderboards/blob/main/docs/googleSheetsSetup.md) to configure a Google Apps Script that exports your spreadsheet data.
   - In the Google Sheets Setup documentation, you'll learn how to copy the URL of your extension. Save this URL to the `baseURL` property in the `config` variable at the top of the `functions.js` file.

3. **Define the Default Leaderboard (Optional):**  
   - In the same `config` variable, you can set a default leaderboard by adding a `defaultLeaderboard` property.
   - The data code for the default leaderboard is generated by taking the name of the sheet that contains your leaderboard and defining a range using this syntax: `"fastest-A1k2000"`. Make sure the specified range includes your leaderboard headers.

4. **Deploy Your Website:**  
   Use a guide like [How to Host a Website on GitHub for Free](https://www.geeksforgeeks.org/how-to-host-a-website-on-github-for-free/) to turn your project into a live website.

5. **Customize the Page Title:**  
   The website title is automatically updated from cell B2 (column B, row 2) in your Google Sheet on the buttonLayout sheet. Any text you enter in that cell will be displayed as the website title.

6. **Styling:**  
   Adjust the look and feel of your leaderboard by editing the `styles.css` file. CSS is simple and almost impossible to break, making it safe to experiment with different options to suit your personal tastes and desires.

Enjoy building your personalized leaderboard!
