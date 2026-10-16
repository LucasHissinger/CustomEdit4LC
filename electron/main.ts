/* eslint-disable @typescript-eslint/no-explicit-any */
import { app, BrowserWindow, ipcMain, protocol } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { create as createYoutubeDl } from 'youtube-dl-exec';
import fs from 'node:fs';
import os from 'node:os';
import clipboardEx from 'electron-clipboard-ex';
import { shell } from 'electron'; // Assurez-vous d'importer 'shell' tout en haut si ce n'est

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

process.env.APP_ROOT = path.join(__dirname, "..");
export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

// 🚀 LE FIX MAGIQUE POUR FFMPEG EN MODE BUILD
let ffmpegPath = ffmpegStatic as string;
// Chemin du binaire yt-dlp, avec le même fix que ffmpeg
let ytDlpBinaryPath = path.join(
  path.dirname(require.resolve('youtube-dl-exec/package.json')),
  'bin',
  'yt-dlp.exe'
);

// Si l'appli est un .exe final, le chemin change pour sortir de l'archive
if (app.isPackaged) {
  ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
  ytDlpBinaryPath = ytDlpBinaryPath.replace('app.asar', 'app.asar.unpacked');
}

// On donne le vrai chemin à fluent-ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);
const youtubedl = createYoutubeDl(ytDlpBinaryPath);

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 850,
    icon: path.join(process.env.APP_ROOT, 'public', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"), 
    },
  });

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'local-media', privileges: { secure: true, supportFetchAPI: true, bypassCSP: true, stream: true } }
]);

app.whenReady().then(() => {
  protocol.registerFileProtocol('local-media', (request, callback) => {
    const requestUrl = new URL(request.url);
    const filePath = requestUrl.searchParams.get('path');
    if (filePath) callback({ path: filePath });
    else callback({ error: -6 });
  });
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('quit-app', () => {
  app.quit();
});

ipcMain.handle('show-item-in-folder', (_event, filePath) => {
  const absolutePath = path.resolve(filePath);
  if (fs.existsSync(absolutePath)) {
    shell.showItemInFolder(absolutePath);
    return true;
  }
  return false;
});

ipcMain.handle('download-media', async (_event, url) => {
  const outputTempPath = path.join(app.getPath('temp'), `download_${Date.now()}.mp4`);
  try {
    await youtubedl(url, {
      output: outputTempPath,
      format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best', 
      ffmpegLocation: ffmpegPath,
    });
    return { success: true, filePath: outputTempPath };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// 1. Fonction pour le chemin automatique
ipcMain.handle('get-export-path', (_event, originalName, ext = "mp4") => {
  const downloadsPath = path.join(os.homedir(), 'Desktop', 'CustomEdit4LC');
  if (!fs.existsSync(downloadsPath)) fs.mkdirSync(downloadsPath, { recursive: true });

  const baseName = originalName.split('.')[0];
  const safeName = baseName.replace(/[<>:"/\\|?*]/g, '_');

  const fileName = `CE4LC_${safeName}.${ext}`;
  return path.join(downloadsPath, fileName);
});

// 2. Fonction pour mettre le fichier dans le presse-papier
ipcMain.handle('copy-file-to-clipboard', (_event, filePath) => {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) return false;

  clipboardEx.writeFilePaths([absolutePath]); // gère nativement CF_HDROP côté Windows
  return true;
});

ipcMain.handle('export-media', async (_event, options) => {
  const { 
    inputPath, startTime, duration, speed, volume, 
    videoEffect, audioEffect, isAudioOnly, exportAsMp3, 
    externalAudioPath, isImage 
  } = options;
  
  const filePath = options.outputPath;
  if (!filePath) return { success: false, error: "Annulé" };

  return new Promise((resolve) => {
    const command = ffmpeg();

    // --- 1. GESTION DES ENTRÉES ---
    if (isImage) {
      // Syntaxe sécurisée : chaque argument est séparé
      command.input(inputPath).inputOptions(['-loop', '1', '-framerate', '25']);
    } else {
      command.input(inputPath).setStartTime(startTime);
    }

    if (externalAudioPath) {
      // Coupe l'audio avant même de le lire (très rapide)
      command.input(externalAudioPath).inputOptions(['-ss', startTime.toString()]);
    }

    command.setDuration(duration);

    // --- 2. GESTION DES FLUX (MAPPING) ET FORMATS ---
    const outputOpts: string[] = [];

    if (exportAsMp3) {
      command.noVideo().format('mp3');
      if (externalAudioPath) outputOpts.push('-map', '1:a:0');
      else outputOpts.push('-map', '0:a:0');
    } else {
      if (externalAudioPath) {
        // Associe l'image (0) et le son (1)
        outputOpts.push('-map', '0:v:0', '-map', '1:a:0', '-shortest');
      }
      
      if (isImage) {
        // 🚀 FORCE l'encodeur vidéo pour éviter que FFmpeg ne se perde avec l'image
        outputOpts.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p');
      }
    }

    // --- 3. FILTRES ---
    const vFilters: string[] = [];
    const aFilters: string[] = [];

    // Audio de base
    if (speed !== 1) {
      if (!isImage && !isAudioOnly && !exportAsMp3) vFilters.push(`setpts=${1/speed}*PTS`);
      aFilters.push(`atempo=${speed}`);
    }
    if (volume !== 1) {
      aFilters.push(`volume=${volume}`);
    }

    // Effets Vidéo
    if (!isAudioOnly && !exportAsMp3) {
      if (videoEffect === 'bw') vFilters.push('hue=s=0');
      if (videoEffect === 'contrast') vFilters.push('eq=contrast=1.5');
      if (videoEffect === 'saturated') vFilters.push('eq=saturation=2');
      if (videoEffect === 'sepia') vFilters.push('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131');
      if (videoEffect === 'invert') vFilters.push('negate');
      if (videoEffect === 'blur') vFilters.push('boxblur=5:1');
      if (videoEffect === 'pixelate') vFilters.push('scale=iw/10:-1,scale=10*iw:-1:flags=neighbor');
      if (videoEffect === 'vignette') vFilters.push('vignette=PI/4');
      if (videoEffect === 'horror') vFilters.push('hue=s=0,eq=contrast=2.5:brightness=-0.1,noise=alls=60:allf=t+u');
      if (videoEffect === 'deepfry') vFilters.push('eq=saturation=5:contrast=2.5,unsharp=5:5:2.0');
      if (videoEffect === 'mirror') vFilters.push('hflip'); 
      if (videoEffect === 'glitch') vFilters.push('rgbashift=rh=-4:bv=4,noise=alls=20:allf=t'); 
      if (videoEffect === 'neon') vFilters.push('edgedetect=mode=colormix:high=0'); 
      if (videoEffect === 'alien_vision') vFilters.push('hue=h=90:s=3'); 
      
      // 🚀 LE FIX MAGIQUE ANTI-CRASH (Doit être ajouté à la TOUTE FIN des filtres vidéo)
      // Cela arrondit la taille de l'image au nombre pair le plus proche
      vFilters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
    }

    // Effets Audio
    if (audioEffect === 'pitch_high') aFilters.push('asetrate=44100*1.5', `atempo=${1/1.5}`);
    if (audioEffect === 'pitch_low') aFilters.push('asetrate=44100*0.7', `atempo=${1/0.7}`);
    if (audioEffect === 'cave') aFilters.push('aecho=0.8:0.8:20|40:0.5|0.3,aecho=0.8:0.8:60|80:0.2|0.1');
    if (audioEffect === 'radio') aFilters.push('highpass=f=300,lowpass=f=3000'); 
    if (audioEffect === 'robot') aFilters.push('aphaser=type=t:speed=2:decay=0.6'); 
    if (audioEffect === 'old_man') aFilters.push('tremolo=f=5:d=0.6,asetrate=44100*0.9,atempo=1/0.9'); 
    if (audioEffect === 'demon') aFilters.push('asetrate=44100*0.5,atempo=2.0,aecho=0.8:0.9:50|100:0.4|0.2'); 
    if (audioEffect === 'underwater') aFilters.push('lowpass=f=400,aecho=0.8:0.9:50|60:0.2|0.1'); 
    if (audioEffect === 'alien_voice') aFilters.push('vibrato=f=10:d=1,asetrate=44100*1.2,atempo=1/1.2'); 
    if (audioEffect === 'reverb') aFilters.push('aecho=0.8:0.9:100:0.3'); 

    // On applique tout
    if (vFilters.length > 0) command.videoFilters(vFilters);
    if (aFilters.length > 0) command.audioFilters(aFilters);
    if (outputOpts.length > 0) command.outputOptions(outputOpts);

    // --- 4. EXÉCUTION ---
    command
      .on('progress', (progress: any) => _event.sender.send('export-progress', Math.round(progress.percent || 0)))
      .on('end', () => resolve({ success: true, savedPath: filePath }))
      .on('error', (err: any) => {
        console.error("Erreur FFmpeg complète :", err);
        resolve({ success: false, error: err.message });
      })
      .save(filePath);
  });
});