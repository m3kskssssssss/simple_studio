// Оболочка настольного приложения Simple Studio (Electron).
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');

// данные приложения (проекты, файлы) — в отдельной папке профиля
app.setName('Simple Studio');

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0b0b0b',
    title: 'Simple Studio',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false, // экспорт видео не тормозит в фоне
    },
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });
  // внешние ссылки — в системном браузере
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // скачивание (экспорт видео, файл проекта) — через диалог «Сохранить как»
  win.webContents.session.on('will-download', (_e, item) => {
    item.setSaveDialogOptions({ title: 'Сохранить', defaultPath: path.join(app.getPath('videos'), item.getFilename()) });
  });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
