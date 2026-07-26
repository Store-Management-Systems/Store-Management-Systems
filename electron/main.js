const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'STORE MANAGEMENT SYSTEMS — B2B & B2C Enterprise',
    icon: path.join(__dirname, '../logo.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Load the web app URL or local index.html
  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '../index.html')}`;
  mainWindow.loadURL(startUrl);

  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
