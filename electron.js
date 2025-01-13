import { app, BrowserWindow } from 'electron';
import path from 'path';

let mainWindow;

app.on('ready', () => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // Si tienes un preload script
    },
  });

  mainWindow.loadURL('http://localhost:3000'); // Si estás corriendo tu React frontend en un servidor
});
