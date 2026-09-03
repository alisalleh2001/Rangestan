import { useCallback, useEffect, useRef, useState } from 'react';
import './index.css';

type ColorReading = {
  id: string;
  hex: string;
  rgb: string;
  name: string;
  timestamp: number;
};

type SavedColor = ColorReading & {
  imageUrl: string;
};

const COLOR_NAMES: Array<{ name: string; hex: string }> = [
  { name: 'Black', hex: '#000000' },
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Crimson', hex: '#DC143C' },
  { name: 'Fire Brick', hex: '#B22222' },
  { name: 'Coral', hex: '#FF7F50' },
  { name: 'Orange', hex: '#FFA500' },
  { name: 'Gold', hex: '#FFD700' },
  { name: 'Khaki', hex: '#F0E68C' },
  { name: 'Olive', hex: '#808000' },
  { name: 'Lime Green', hex: '#32CD32' },
  { name: 'Forest Green', hex: '#228B22' },
  { name: 'Turquoise', hex: '#40E0D0' },
  { name: 'Teal', hex: '#008080' },
  { name: 'Sky Blue', hex: '#87CEEB' },
  { name: 'Deep Sky Blue', hex: '#00BFFF' },
  { name: 'Royal Blue', hex: '#4169E1' },
  { name: 'Navy', hex: '#000080' },
  { name: 'Indigo', hex: '#4B0082' },
  { name: 'Purple', hex: '#800080' },
  { name: 'Violet', hex: '#EE82EE' },
  { name: 'Hot Pink', hex: '#FF69B4' },
  { name: 'Brown', hex: '#A52A2A' },
  { name: 'Chocolate', hex: '#D2691E' },
  { name: 'Tan', hex: '#D2B48C' },
  { name: 'Gray', hex: '#808080' },
  { name: 'Silver', hex: '#C0C0C0' },
];

const STORAGE_KEYS = {
  history: 'rangestan-history',
  saved: 'rangestan-saved',
};

function readStored<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function colorDistance(first: string, second: string): number {
  const a = [1, 3, 5].map((index) => Number.parseInt(first.slice(index, index + 2), 16));
  const b = [1, 3, 5].map((index) => Number.parseInt(second.slice(index, index + 2), 16));
  return Math.sqrt(a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0));
}

function nearestColorName(hex: string): string {
  return COLOR_NAMES.reduce((nearest, option) =>
    colorDistance(hex, option.hex) < colorDistance(hex, nearest.hex) ? option : nearest,
  ).name;
}

function makeReading(red: number, green: number, blue: number): ColorReading {
  const hex = `#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  return {
    id: `${Date.now()}-${hex}`,
    hex,
    rgb: `rgb(${red}, ${green}, ${blue})`,
    name: nearestColorName(hex),
    timestamp: Date.now(),
  };
}

function ColorCard({ color, testId }: { color: ColorReading; testId: string }) {
  return (
    <section className="color-card" aria-live="polite" data-testid={testId}>
      <div className="swatch" style={{ backgroundColor: color.hex }} data-testid="live-swatch" />
      <div className="color-details">
        <p className="eyebrow">Approximate color</p>
        <h1 data-testid="color-name">{color.name}</h1>
        <p className="hex-code" dir="ltr" data-testid="hex-code">{color.hex}</p>
        <p className="rgb-code" dir="ltr" data-testid="rgb-code">{color.rgb}</p>
      </div>
    </section>
  );
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const latestRef = useRef<ColorReading | null>(null);
  const [current, setCurrent] = useState<ColorReading>(() => makeReading(135, 206, 235));
  const [history, setHistory] = useState<ColorReading[]>(() => readStored<ColorReading[]>(STORAGE_KEYS.history, []));
  const [saved, setSaved] = useState<SavedColor[]>(() => readStored<SavedColor[]>(STORAGE_KEYS.saved, []));
  const [cameraState, setCameraState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [cameraMessage, setCameraMessage] = useState('Starting camera...');
  const [frozen, setFrozen] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [flashAvailable, setFlashAvailable] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.saved, JSON.stringify(saved));
  }, [saved]);

  useEffect(() => {
    let active = true;
    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraState('error');
        setCameraMessage('Camera is not supported in this browser.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const track = stream.getVideoTracks()[0];
        const capabilities = track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
        setFlashAvailable(Boolean(capabilities?.torch));
        setCameraState('ready');
        setCameraMessage('');
      } catch (error) {
        setCameraState('error');
        setCameraMessage('Camera access was not granted. Please allow camera access and try again.');
        console.error('Camera start failed', error);
      }
    };
    void startCamera();
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (cameraState !== 'ready' || frozen) return;
    const interval = window.setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) return;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      const sampleSize = 18;
      canvas.width = sampleSize;
      canvas.height = sampleSize;
      const sourceX = Math.max(0, Math.floor(video.videoWidth / 2 - sampleSize / 2));
      const sourceY = Math.max(0, Math.floor(video.videoHeight / 2 - sampleSize / 2));
      context.drawImage(video, sourceX, sourceY, sampleSize, sampleSize, 0, 0, sampleSize, sampleSize);
      const pixels = context.getImageData(0, 0, sampleSize, sampleSize).data;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        red += pixels[index];
        green += pixels[index + 1];
        blue += pixels[index + 2];
      }
      const total = pixels.length / 4;
      const reading = makeReading(Math.round(red / total), Math.round(green / total), Math.round(blue / total));
      latestRef.current = reading;
      setCurrent(reading);
      setHistory((previous) => {
        const mostRecent = previous[0];
        if (mostRecent && colorDistance(mostRecent.hex, reading.hex) < 14) return previous;
        return [reading, ...previous].slice(0, 20);
      });
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(reading.hex).catch(() => undefined);
      }
    }, 420);
    return () => window.clearInterval(interval);
  }, [cameraState, frozen]);

  const toggleFlash = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !flashAvailable) return;
    try {
      const next = !flashOn;
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setFlashOn(next);
    } catch (error) {
      setCameraMessage('Flashlight is not available on this camera.');
      console.error('Flash toggle failed', error);
    }
  }, [flashAvailable, flashOn]);

  const retryCamera = async () => {
    setCameraState('loading');
    setCameraMessage('Reload the page to request camera access again.');
  };

  const saveCurrent = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || cameraState !== 'ready') {
      setSaveState('error');
      setSaveMessage('Camera preview is not ready.');
      return;
    }
    setSaveState('saving');
    setSaveMessage('Saving selected color...');
    const photoCanvas = document.createElement('canvas');
    photoCanvas.width = video.videoWidth;
    photoCanvas.height = video.videoHeight;
    const context = photoCanvas.getContext('2d');
    if (!context) {
      setSaveState('error');
      setSaveMessage('Could not create the image.');
      return;
    }
    context.drawImage(video, 0, 0, photoCanvas.width, photoCanvas.height);
    photoCanvas.toBlob(async (blob) => {
      if (!blob) {
        setSaveState('error');
        setSaveMessage('Could not create the image.');
        return;
      }
      try {
        const data = new FormData();
        data.append('file', new File([blob], `rangestan-${Date.now()}.jpg`, { type: 'image/jpeg' }));
        const response = await fetch(import.meta.env.VITE_PLATFORM_SERVICES_URL + '/storage/upload', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + import.meta.env.VITE_PLATFORM_SERVICE_TOKEN },
          body: data,
        });
        if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
        const result = (await response.json()) as { url: string };
        const selected = latestRef.current ?? current;
        setSaved((previous) => [{ ...selected, id: `${Date.now()}-saved`, imageUrl: result.url }, ...previous]);
        setSaveState('idle');
        setSaveMessage('Saved.');
      } catch (error) {
        setSaveState('error');
        setSaveMessage('The selected image could not be saved right now.');
        console.error('Save color failed', error);
      }
    }, 'image/jpeg', 0.9);
  };

  const deleteSaved = async (item: SavedColor) => {
    setSaved((previous) => previous.filter((savedItem) => savedItem.id !== item.id));
    try {
      await fetch(import.meta.env.VITE_PLATFORM_SERVICES_URL + '/storage/delete', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + import.meta.env.VITE_PLATFORM_SERVICE_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: item.imageUrl }),
      });
    } catch (error) {
      console.error('Delete saved image failed', error);
    }
  };

  return (
    <main className="app-shell">
      <div className="app-content">
        <header className="app-header">
          <p className="app-title" data-testid="app-title">Rangestan</p>
        </header>

        <section className="camera-section" aria-label="Live camera color reader">
          <div className="camera-frame" data-testid="camera-frame">
            <video ref={videoRef} className="camera-preview" playsInline muted autoPlay />
            <div className="sample-target" aria-label="Color sample target"><span /></div>
            {cameraState !== 'ready' && <div className="camera-overlay" data-testid="camera-status">{cameraMessage}</div>}
          </div>
          <canvas ref={canvasRef} className="hidden" />
          {cameraState === 'error' && <button className="retry-button" onClick={() => void retryCamera()} data-testid="retry-camera">Try again</button>}
        </section>

        <ColorCard color={current} testId="live-color-card" />

        <section className="actions" aria-label="Color actions">
          <button className={`action-button ${frozen ? 'active' : ''}`} onClick={() => setFrozen((value) => !value)} data-testid="freeze-button">
            {frozen ? 'Unfreeze color' : 'Freeze color'}
          </button>
          <button className={`action-button ${flashOn ? 'active' : ''}`} onClick={() => void toggleFlash()} disabled={!flashAvailable || cameraState !== 'ready'} data-testid="flash-button">
            {flashAvailable ? (flashOn ? 'Flash off' : 'Flash on') : 'Flash unavailable'}
          </button>
          <button className="save-button" onClick={() => void saveCurrent()} disabled={saveState === 'saving' || cameraState !== 'ready'} data-testid="save-color-button">
            {saveState === 'saving' ? 'Saving...' : 'Save selected color'}
          </button>
        </section>
        {saveMessage && <p className={`status-message ${saveState === 'error' ? 'error' : ''}`} data-testid="save-status">{saveMessage}</p>}

        <section className="list-section" aria-labelledby="history-heading">
          <div className="section-heading"><h2 id="history-heading">Color history</h2><span>{history.length}</span></div>
          {history.length === 0 ? <p className="empty-state" data-testid="history-empty">Point the camera at a color to begin.</p> : (
            <div className="history-grid" data-testid="history-list">
              {history.map((item) => <article key={item.id} className="history-item" data-testid={`history-${item.id}`}><span className="mini-swatch" style={{ backgroundColor: item.hex }} /><div><strong>{item.name}</strong><small dir="ltr">{item.hex}</small></div></article>)}
            </div>
          )}
        </section>

        <section className="list-section" aria-labelledby="saved-heading">
          <div className="section-heading"><h2 id="saved-heading">Saved colors</h2><span>{saved.length}</span></div>
          {saved.length === 0 ? <p className="empty-state" data-testid="saved-empty">No saved colors yet.</p> : (
            <div className="saved-grid" data-testid="saved-list">
              {saved.map((item) => <article key={item.id} className="saved-item" data-testid={`saved-${item.id}`}><img src={item.imageUrl} alt={`${item.name} saved color`} /><div className="saved-info"><span className="mini-swatch" style={{ backgroundColor: item.hex }} /><div><strong>{item.name}</strong><small dir="ltr">{item.hex}</small></div></div><button className="delete-button" onClick={() => void deleteSaved(item)} data-testid={`delete-${item.id}`}>Delete</button></article>)}
            </div>
          )}
        </section>
      </div>
      <footer data-testid="footer">Developed by Ali saleh</footer>
    </main>
  );
}
