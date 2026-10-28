/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from "react";
import Slider from "rc-slider";
import "rc-slider/assets/index.css";
import "./index.css";

declare global {
  interface Window {
    electronAPI: {
      downloadMedia: (url: string) => Promise<any>;
      exportMedia: (options: any) => Promise<any>;
      quitApp: () => void;
      onExportProgress: (callback: (p: number) => void) => void;
      getExportPath: (originalName: string, ext: string) => Promise<string>;
      copyFileToClipboard: (filePath: string) => Promise<boolean>;
      showItemInFolder: (filePath: string) => Promise<boolean>;
    };
  }
}

export default function App() {
  type CropBox = { top: number; bottom: number; left: number; right: number };
  const [cropBox, setCropBox] = useState<CropBox>({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  });
  const [cropMode, setCropMode] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const [videoRect, setVideoRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragEdgeRef = useRef<keyof CropBox | null>(null);

  const hasCrop =
    cropBox.top + cropBox.bottom + cropBox.left + cropBox.right > 0;

  const [mediaPath, setMediaPath] = useState<string | null>(null);
  const [isAudioOnly, setIsAudioOnly] = useState(false);
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [exportedFilePath, setExportedFilePath] = useState<string | null>(null);
  const [exportAsMp3, setExportAsMp3] = useState(false);
  const [externalAudioPath, setExternalAudioPath] = useState<string | null>(
    null,
  );
  const [isImage, setIsImage] = useState(false);
  const externalAudioRef = useRef<HTMLAudioElement>(null);
  // const [currentTime, setCurrentTime] = useState(0);

  const [exportState, setExportState] = useState<
    "idle" | "naming" | "exporting" | "done"
  >("idle");
  const [customFileName, setCustomFileName] = useState("");
  const [progress, setProgress] = useState(0);

  const [videoDuration, setVideoDuration] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(10);

  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(100);

  const [videoEffect, setVideoEffect] = useState("none");
  const [audioEffect, setAudioEffect] = useState("none");

  const mediaRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onExportProgress((p) => setProgress(p));
    }
  }, []);

  useEffect(() => {
    // Si c'est une vidéo, on applique à la vidéo
    if (mediaRef.current && !isImage) {
      mediaRef.current.playbackRate = speed;
      mediaRef.current.volume = Math.min(volume / 100, 1);
    }
    // Si on a un audio externe, on DOIT lui appliquer aussi !
    if (externalAudioRef.current) {
      externalAudioRef.current.playbackRate = speed;
      externalAudioRef.current.volume = Math.min(volume / 100, 1);
    }
  }, [speed, volume, isImage]);

  const handleDownload = async () => {
    if (!url) return;
    setIsLoading(true);
    const res = await window.electronAPI.downloadMedia(url);
    if (res.success) {
      setMediaPath(
        `local-media://asset/?path=${encodeURIComponent(res.filePath)}`,
      );
      setIsAudioOnly(false);
      setIsImage(false);
      setExternalAudioPath(null);
      resetCrop();
      setNaturalSize(null);
      setVideoRect(null);
    } else alert("Erreur : " + res.error);
    setIsLoading(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] as any;
    if (file && file.path) {
      setMediaPath(
        `local-media://asset/?path=${encodeURIComponent(file.path)}`,
      );
      setIsAudioOnly(file.type.startsWith("audio/"));
      setIsImage(file.type.startsWith("image/"));
      setExternalAudioPath(null);
      resetCrop();
      setNaturalSize(null);
      setVideoRect(null);
    }
  };

  const handleExternalAudioUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0] as any;
    if (file && file.path && file.type.startsWith("audio/")) {
      setExternalAudioPath(
        `local-media://asset/?path=${encodeURIComponent(file.path)}`,
      );
    }
  };

  const handleLoadedMetadata = (e: any) => {
    const dur = e.target.duration;
    if (dur && dur !== Infinity) {
      setVideoDuration(dur);
      setStartTime(0);
      setEndTime(dur);
    }
    if (e.target.videoWidth) {
      setNaturalSize({ w: e.target.videoWidth, h: e.target.videoHeight });
    }
  };

  const handlePreviewClip = () => {
    // Coupe tout
    if (mediaRef.current) mediaRef.current.pause();
    if (externalAudioRef.current) externalAudioRef.current.pause();

    // Relance la vidéo/image et le son en même temps
    if (externalAudioPath && externalAudioRef.current) {
      externalAudioRef.current.currentTime = startTime;
      externalAudioRef.current.play();
    }
    if (!isImage && mediaRef.current) {
      mediaRef.current.currentTime = startTime;
      mediaRef.current.play();
    }
  };

  // Zone réellement occupée par l'image/vidéo dans son élément (hors bandes du letterbox CSS)
  const updateVideoRect = () => {
    const el = isImage ? imgRef.current : mediaRef.current;
    if (!el || !naturalSize) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const scale = Math.min(cw / naturalSize.w, ch / naturalSize.h);
    const width = naturalSize.w * scale;
    const height = naturalSize.h * scale;
    setVideoRect({
      left: el.offsetLeft + (cw - width) / 2,
      top: el.offsetTop + (ch - height) / 2,
      width,
      height,
    });
  };

  useEffect(() => {
    updateVideoRect();
    const el = isImage ? imgRef.current : mediaRef.current;
    const ro = new ResizeObserver(updateVideoRect);
    if (el) ro.observe(el);
    window.addEventListener("resize", updateVideoRect);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateVideoRect);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naturalSize, isImage, mediaPath, isAudioOnly]);

  const resetCrop = () => {
    setCropBox({ top: 0, bottom: 0, left: 0, right: 0 });
    setCropMode(false);
  };

  const startDrag = (edge: keyof CropBox) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragEdgeRef.current = edge;
  };

  const onDrag = (e: React.PointerEvent) => {
    const edge = dragEdgeRef.current;
    const overlay = overlayRef.current;
    if (!edge || !overlay) return;
    const r = overlay.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const fy = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    const MIN = 0.1; // le cadre garde au minimum 10% de la taille

    setCropBox((prev) => {
      switch (edge) {
        case "left":
          return { ...prev, left: Math.min(fx, 1 - prev.right - MIN) };
        case "right":
          return { ...prev, right: Math.min(1 - fx, 1 - prev.left - MIN) };
        case "top":
          return { ...prev, top: Math.min(fy, 1 - prev.bottom - MIN) };
        case "bottom":
          return { ...prev, bottom: Math.min(1 - fy, 1 - prev.top - MIN) };
      }
    });
  };

  const endDrag = () => {
    dragEdgeRef.current = null;
  };

  const handleOpenNamingModal = () => {
    if (!mediaPath) return;
    const decodedPath = new URL(mediaPath).searchParams.get("path") || "";
    const originalName =
      decodedPath.split(/[\\/]/).pop() || `export_${Date.now()}.mp4`;
    const baseName = originalName.split(".")[0];

    // Pré-remplit l'input avec un nom propre par défaut
    setCustomFileName(baseName.replace(/[<>:"/\\|?*]/g, "_"));
    setExportState("naming");
  };

  const handleConfirmExport = async () => {
    setExportState("exporting");
    setProgress(0);

    const decodedPath = new URL(mediaPath!).searchParams.get("path") || "";
    const ext = exportAsMp3 ? "mp3" : "mp4";

    const savePath = await window.electronAPI.getExportPath(
      customFileName || "export",
      ext,
    );
    setExportedFilePath(savePath);

    const res = await window.electronAPI.exportMedia({
      inputPath: decodedPath,
      outputPath: savePath,
      startTime,
      duration: endTime - startTime,
      speed,
      volume: volume / 100,
      videoEffect,
      audioEffect,
      isAudioOnly,
      exportAsMp3,
      externalAudioPath: externalAudioPath
        ? new URL(externalAudioPath).searchParams.get("path")
        : null,
      isImage,
      crop: hasCrop ? cropBox : null,
    });

    if (res.success) setExportState("done");
    else {
      alert("Erreur : " + res.error);
      setExportState("idle");
    }
  };

  const handleTimeUpdate = () => {
    const player = isImage ? externalAudioRef.current : mediaRef.current;

    if (player) {
      const current = player.currentTime;
      // setCurrentTime(current);
      if (!player.paused && current >= endTime) {
        player.pause();
        player.currentTime = startTime;
      }
    }
  };

  const handleSliderChange = (val: number | number[]) => {
    if (Array.isArray(val)) {
      const [newStart, newEnd] = val;
      if (mediaRef.current) {
        mediaRef.current.pause();
        if (newStart !== startTime) mediaRef.current.currentTime = newStart;
        else if (newEnd !== endTime) mediaRef.current.currentTime = newEnd;
      }
      setStartTime(newStart);
      setEndTime(newEnd);
    }
  };

  // const handlePlaybackSliderChange = (val: number | number[]) => {
  //   if (typeof val === "number") {
  //     setCurrentTime(val);
  //     if (mediaRef.current) mediaRef.current.currentTime = val;
  //     if (externalAudioRef.current) externalAudioRef.current.currentTime = val;
  //   }
  // };

  const getPreviewFilter = () => {
    switch (videoEffect) {
      case "bw":
        return "grayscale(100%)";
      case "contrast":
        return "contrast(150%)";
      case "saturated":
        return "saturate(200%)";
      case "sepia":
        return "sepia(100%)";
      case "invert":
        return "invert(100%)";
      case "blur":
        return "blur(5px)";
      case "horror":
        return "grayscale(100%) contrast(200%) brightness(80%)";
      case "deepfry":
        return "saturate(400%) contrast(200%)";
      case "mirror":
        return "scaleX(-1)";
      case "alien_vision":
        return "hue-rotate(90deg) saturate(300%)";
      default:
        return "none"; // glitch et neon n'ont pas de bon équivalent CSS simple
    }
  };

  if (!mediaPath) {
    return (
      <div className="container center">
        <h1>✂️ CustomEdit4LC</h1>
        <div className="card">
          <h3>1. From a URL (YouTube, TikTok...)</h3>
          <div className="input-group">
            <input
              type="text"
              placeholder="URL..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button
              className="btn-primary"
              onClick={handleDownload}
              disabled={isLoading}
            >
              {isLoading ? "Downloading..." : "Download"}
            </button>
          </div>

          <h3 style={{ marginTop: "30px" }}>2. From your PC</h3>
          <label
            className="btn-primary"
            style={{ display: "block", textAlign: "center" }}
          >
            Choose a file
            <input
              type="file"
              accept="video/*,audio/*,image/*"
              onChange={handleFileUpload}
              style={{ display: "none" }}
            />
          </label>
        </div>
      </div>
    );
  }

  return (
    <>
      {exportState !== "idle" && (
        <div className="export-overlay">
          <div className="export-modal">
            {exportState === "naming" ? (
              <>
                <h2>Name your file</h2>
                <div style={{ width: "100%", margin: "20px 0" }}>
                  <input
                    type="text"
                    value={customFileName}
                    onChange={(e) => setCustomFileName(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px",
                      borderRadius: "8px",
                      border: "1px solid #444",
                      background: "#2a2a2a",
                      color: "#fff",
                      fontSize: "16px",
                      outline: "none",
                    }}
                    placeholder="Name of the file..."
                    autoFocus
                  />
                </div>
                <div style={{ display: "flex", gap: "10px", width: "100%" }}>
                  <button
                    className="btn-primary"
                    style={{ background: "#444", flex: 1 }}
                    onClick={() => setExportState("idle")}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-primary"
                    style={{ background: "#10B981", flex: 1 }}
                    onClick={handleConfirmExport}
                  >
                    Validate & Export
                  </button>
                </div>
              </>
            ) : exportState === "exporting" ? (
              <>
                <h2>⏳ Export in progress...</h2>
                <div className="progress-bar-container">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
                <p style={{ color: "#10B981", fontWeight: "bold" }}>
                  {progress}%
                </p>
              </>
            ) : (
              <>
                <h2>Export completed !</h2>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    marginTop: 30,
                    width: "100%",
                  }}
                >
                  <button
                    className="btn-primary"
                    onClick={() => setExportState("idle")}
                  >
                    Continue editing
                  </button>
                  <button
                    className="btn-primary"
                    style={{ background: "#F59E0B" }}
                    onClick={async () => {
                      if (!exportedFilePath) return;
                      await window.electronAPI.showItemInFolder(
                        exportedFilePath,
                      );
                    }}
                  >
                    Open in file explorer
                  </button>
                  <button
                    className="btn-success"
                    onClick={async () => {
                      if (!exportedFilePath) return;
                      const ok =
                        await window.electronAPI.copyFileToClipboard(
                          exportedFilePath,
                        );
                      if (ok) {
                        alert(
                          "Media copied to clipboard ! Press Ctrl+V in Discord.",
                        );
                      } else {
                        alert("Error : Missing file.");
                      }
                    }}
                  >
                    Copy to clipboard
                  </button>
                  <button
                    className="btn-danger"
                    onClick={() => window.electronAPI.quitApp()}
                  >
                    Quit
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="container layout-split">
        <div className="preview-section">
          <button className="back-btn" onClick={() => setMediaPath(null)}>
            Change file
          </button>

          <div
            className="media-player-wrapper"
            style={{ position: "relative", overflow: "visible" }}
          >
            {isImage ? (
              <img
                ref={imgRef}
                src={mediaPath}
                onLoad={(e) =>
                  setNaturalSize({
                    w: e.currentTarget.naturalWidth,
                    h: e.currentTarget.naturalHeight,
                  })
                }
                style={{
                  width: "100%",
                  maxHeight: "65vh",
                  objectFit: "contain",
                  filter: getPreviewFilter(),
                  transition: "filter 0.3s",
                }}
              />
            ) : (
              <video
                key={mediaPath}
                ref={mediaRef}
                src={mediaPath}
                controls={!cropMode}
                autoPlay
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
                style={{
                  display: isAudioOnly ? "none" : "block",
                  width: "100%",
                  maxHeight: "65vh",
                  filter: getPreviewFilter(),
                  transition: "filter 0.3s",
                }}
              />
            )}
            {externalAudioPath && (
              <audio
                ref={externalAudioRef}
                src={externalAudioPath}
                autoPlay
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
              />
            )}
            {isAudioOnly && <div className="audio-placeholder">Audio only</div>}
            {videoRect && (cropMode || hasCrop) && (
              <div
                ref={overlayRef}
                style={{
                  position: "absolute",
                  left: videoRect.left,
                  top: videoRect.top,
                  width: videoRect.width,
                  height: videoRect.height,
                  pointerEvents: "none",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: 0,
                    height: `${cropBox.top * 100}%`,
                    background: "rgba(0,0,0,0.65)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: `${cropBox.bottom * 100}%`,
                    background: "rgba(0,0,0,0.65)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    width: `${cropBox.left * 100}%`,
                    top: `${cropBox.top * 100}%`,
                    bottom: `${cropBox.bottom * 100}%`,
                    background: "rgba(0,0,0,0.65)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    width: `${cropBox.right * 100}%`,
                    top: `${cropBox.top * 100}%`,
                    bottom: `${cropBox.bottom * 100}%`,
                    background: "rgba(0,0,0,0.65)",
                  }}
                />

                <div
                  style={{
                    position: "absolute",
                    left: `${cropBox.left * 100}%`,
                    right: `${cropBox.right * 100}%`,
                    top: `${cropBox.top * 100}%`,
                    bottom: `${cropBox.bottom * 100}%`,
                    border: "2px solid #10B981",
                    boxSizing: "border-box",
                  }}
                />

                {cropMode &&
                  (
                    [
                      {
                        k: "top",
                        style: {
                          left: `${cropBox.left * 100}%`,
                          right: `${cropBox.right * 100}%`,
                          top: `calc(${cropBox.top * 100}% - 8px)`,
                          height: 16,
                          cursor: "ns-resize",
                        },
                      },
                      {
                        k: "bottom",
                        style: {
                          left: `${cropBox.left * 100}%`,
                          right: `${cropBox.right * 100}%`,
                          bottom: `calc(${cropBox.bottom * 100}% - 8px)`,
                          height: 16,
                          cursor: "ns-resize",
                        },
                      },
                      {
                        k: "left",
                        style: {
                          top: `${cropBox.top * 100}%`,
                          bottom: `${cropBox.bottom * 100}%`,
                          left: `calc(${cropBox.left * 100}% - 8px)`,
                          width: 16,
                          cursor: "ew-resize",
                        },
                      },
                      {
                        k: "right",
                        style: {
                          top: `${cropBox.top * 100}%`,
                          bottom: `${cropBox.bottom * 100}%`,
                          right: `calc(${cropBox.right * 100}% - 8px)`,
                          width: 16,
                          cursor: "ew-resize",
                        },
                      },
                    ] as { k: keyof CropBox; style: React.CSSProperties }[]
                  ).map(({ k, style }) => (
                    <div
                      key={k}
                      onPointerDown={startDrag(k)}
                      onPointerMove={onDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      style={{
                        position: "absolute",
                        pointerEvents: "auto",
                        touchAction: "none",
                        background: "rgba(16,185,129,0.5)",
                        ...style,
                      }}
                    />
                  ))}
              </div>
            )}
          </div>

          {/* <div
            style={{
              background: "#161616",
              padding: "15px 20px",
              borderRadius: "12px",
              marginTop: "10px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "8px",
                color: "#888",
                fontSize: "13px",
              }}
            >
              <span>{currentTime.toFixed(1)}s</span>
              <span>{videoDuration.toFixed(1)}s</span>
            </div>
            <Slider
              min={0}
              max={videoDuration || 10}
              step={0.1}
              value={currentTime}
              onChange={handlePlaybackSliderChange}
              trackStyle={[{ backgroundColor: "#3B82F6", height: 6 }]}
              handleStyle={[
                {
                  borderColor: "#3B82F6",
                  backgroundColor: "#fff",
                  width: 16,
                  height: 16,
                  marginTop: -5,
                },
              ]}
              railStyle={{ backgroundColor: "#333", height: 6 }}
            />
          </div> */}

          <div
            style={{
              background: "#1e1e1e",
              padding: "20px",
              borderRadius: "12px",
              marginTop: "20px",
            }}
          >
            <h3>Select the clip portion</h3>

            {isImage && !externalAudioPath ? (
              <p
                style={{
                  color: "#F59E0B",
                  textAlign: "center",
                  margin: "20px 0",
                }}
              >
                Add a track (on the right) to enable the timeline.
              </p>
            ) : (
              <>
                <div
                  style={{
                    marginBottom: "10px",
                    display: "flex",
                    justifyContent: "space-between",
                    color: "#aaa",
                  }}
                >
                  <span>Start : {startTime.toFixed(1)}s</span>
                  <span>Duration : {(endTime - startTime).toFixed(1)}s</span>
                  <span>End : {endTime.toFixed(1)}s</span>
                </div>

                <Slider
                  range
                  min={0}
                  max={videoDuration}
                  step={0.1}
                  value={[startTime, endTime]}
                  onChange={handleSliderChange}
                  trackStyle={[{ backgroundColor: "#10B981", height: 8 }]}
                  handleStyle={[
                    {
                      borderColor: "#10B981",
                      backgroundColor: "#fff",
                      width: 20,
                      height: 20,
                      marginTop: -6,
                    },
                    {
                      borderColor: "#10B981",
                      backgroundColor: "#fff",
                      width: 20,
                      height: 20,
                      marginTop: -6,
                    },
                  ]}
                  railStyle={{ backgroundColor: "#333", height: 8 }}
                />

                <button
                  className="btn-primary"
                  style={{
                    width: "100%",
                    marginTop: "20px",
                    background: "#3B82F6",
                  }}
                  onClick={handlePreviewClip}
                >
                  ▶Preview the clip (From {startTime.toFixed(1)}s to{" "}
                  {endTime.toFixed(1)}s)
                </button>
              </>
            )}
          </div>
        </div>

        <div className="controls-section">
          <h2>Clip Settings</h2>

          <div className="control-group">
            <label>Speed : {speed}x</label>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>

          <div className="control-group">
            <label>
              Volume : {volume}%{" "}
              {volume > 100 && " (Will be amplified in the export)"}
            </label>
            <input
              type="range"
              min="0"
              max="200"
              step="5"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>

          {!isAudioOnly && (
            <>
              <div className="control-group">
                <label>Video Effect</label>
                <select
                  value={videoEffect}
                  onChange={(e) => setVideoEffect(e.target.value)}
                >
                  <option value="none">Normal</option>
                  <option value="bw">Noir & Blanc</option>
                  <option value="sepia">Sépia (Rétro)</option>
                  <option value="invert">Inversé (Négatif)</option>
                  <option value="contrast">Contraste Élevé</option>
                  <option value="saturated">Super Saturé</option>
                  <option value="blur">Flou</option>
                  <option value="mirror">Effet Miroir</option>
                  <option value="pixelate">Pixelisé (Jeu Rétro)</option>
                  <option value="vignette">Vignette (Sombre autour)</option>
                  <option value="horror">
                    Cauchemar (Noir, Contrasté, Bruit)
                  </option>
                  <option value="deepfry">
                    Friture (Saturé extrême + Net)
                  </option>
                  <option value="neon">Contours Fluo (Néon)</option>
                  <option value="alien_vision">Vision Alien (Toxique)</option>
                  <option value="glitch">Vieux VHS Cassé / Glitch</option>
                </select>
              </div>
              <div className="control-group">
                <label>Crop</label>
                <button
                  className="btn-primary"
                  style={{
                    width: "100%",
                    marginTop: "5px",
                    background: cropMode ? "#10B981" : "#3B82F6",
                  }}
                  onClick={() => setCropMode((v) => !v)}
                  disabled={!videoRect}
                >
                  {cropMode ? "Finish cropping" : "Crop the video"}
                </button>
                {hasCrop && (
                  <>
                    <p
                      style={{
                        fontSize: "13px",
                        color: "#aaa",
                        margin: "8px 0 4px",
                      }}
                    >
                      Removed: top {(cropBox.top * 100).toFixed(0)}% · bottom{" "}
                      {(cropBox.bottom * 100).toFixed(0)}% · left{" "}
                      {(cropBox.left * 100).toFixed(0)}% · right{" "}
                      {(cropBox.right * 100).toFixed(0)}%
                    </p>
                    <button
                      style={{
                        width: "100%",
                        background: "red",
                        color: "white",
                        border: "none",
                        padding: "5px",
                      }}
                      onClick={resetCrop}
                    >
                      Reset cropping
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          <div className="control-group">
            <label>Audio Effect</label>
            <select
              value={audioEffect}
              onChange={(e) => setAudioEffect(e.target.value)}
            >
              <option value="none">Normal</option>
              <option value="pitch_high">Voix Aiguë (Chipmunk)</option>
              <option value="pitch_low">Voix Grave</option>
              <option value="reverb">Salle vide (Léger Écho)</option>
              <option value="cave">Grotte (Grande Réverbération)</option>
              <option value="underwater">Sous l'eau (Étouffé)</option>
              <option value="radio">Filtre Radio / Téléphone</option>
              <option value="robot">Voix Métallique / Robot</option>
              <option value="alien_voice">Voix Alien Tremblante</option>
              <option value="old_man">Vieux Tremblant</option>
              <option value="demon">Démon de l'Enfer</option>
            </select>
          </div>

          {isImage && (
            <div className="control-group">
              <label>Add background music (Required)</label>
              <label
                className="btn-primary"
                style={{
                  display: "block",
                  textAlign: "center",
                  cursor: "pointer",
                  marginTop: "5px",
                  background: "#3B82F6",
                  color: "white",
                }}
              >
                {externalAudioPath
                  ? "Sound added (click to change)"
                  : "Choose a .MP3 or .WAV file"}
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleExternalAudioUpload}
                  style={{ display: "none" }}
                />
              </label>
              {externalAudioPath && (
                <button
                  style={{
                    width: "100%",
                    marginTop: "5px",
                    background: "red",
                    color: "white",
                    border: "none",
                    padding: "5px",
                  }}
                  onClick={() => setExternalAudioPath(null)}
                >
                  Remove external sound
                </button>
              )}
            </div>
          )}

          <div
            className="control-group"
            style={{ display: "flex", alignItems: "center", gap: "10px" }}
          >
            <input
              type="checkbox"
              id="mp3Only"
              checked={exportAsMp3}
              onChange={(e) => setExportAsMp3(e.target.checked)}
              style={{ width: "20px", height: "20px" }}
            />
            <label htmlFor="mp3Only" style={{ fontWeight: "bold" }}>
              Export as .MP3
            </label>
          </div>

          <button
            className="export-btn"
            onClick={handleOpenNamingModal}
            disabled={exportState !== "idle" || (isImage && !externalAudioPath)}
          >
            {isImage && !externalAudioPath
              ? "Missing music for the export"
              : "Export the final file"}
          </button>
        </div>
      </div>
    </>
  );
}
