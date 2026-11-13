import { useEffect, useRef, useState } from 'react';

export default function AudioAttachment({value, onChange, onRecordingChange, active = true}: {
  active?: boolean; value: string; onChange: (data: string) => void; onRecordingChange: (active: boolean) => void;
}) {
  const activeRef = useRef(active);
  activeRef.current = active;
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout>>();
  const mounted = useRef(true);
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { mounted.current = true; return () => {
    mounted.current = false; clearTimeout(timeout.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach(t => t.stop());
  }; }, []);
  useEffect(() => { if (!active && recorder.current?.state === 'recording') recorder.current.stop(); }, [active]);
  const start = async () => {
    setError(''); setStarting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Audio recording is unavailable in this browser. You can still type a note.');
      const media = await navigator.mediaDevices.getUserMedia({audio:true});
      if (!mounted.current || !activeRef.current) { media.getTracks().forEach(t => t.stop()); return; }
      stream.current = media;
      const rec = new MediaRecorder(media); recorder.current = rec;
      const chunks: BlobPart[] = [];
      rec.ondataavailable = e => {if(e.data.size) chunks.push(e.data);};
      rec.onstop = () => {
        clearTimeout(timeout.current); media.getTracks().forEach(t => t.stop());
        if(!mounted.current) return;
        setRecording(false);
        const blob = new Blob(chunks, {type: rec.mimeType || 'audio/webm'});
        if (!blob.size) {onRecordingChange(false);setError('No audio captured. Please try again.'); return;}
        if(blob.size > 5 * 1024 * 1024) {onRecordingChange(false);setError('Recording is too large. Try a shorter clip.');return;}
        const reader = new FileReader();
        reader.onload = () => {if(mounted.current) {onChange(String(reader.result));onRecordingChange(false);}};
        reader.onerror = () => {if(mounted.current) {onRecordingChange(false);setError('Could not read the recording. Please try again.');}};
        reader.readAsDataURL(blob);
      };
      rec.onerror = () => {if(mounted.current) setError('Recording interrupted. Try again.'); media.getTracks().forEach(t => t.stop());};
      rec.start(); setRecording(true); onRecordingChange(true);
      timeout.current = setTimeout(() => {if(rec.state === 'recording') rec.stop();}, 60000);
    } catch(e) { stream.current?.getTracks().forEach(t => t.stop()); if(mounted.current) setError(e instanceof Error ? e.message : 'Microphone access failed.'); }
    finally {if(mounted.current) setStarting(false);}
  };
  return <div className="audio-attachment">
    {value && <audio controls src={value} aria-label="Recorded voice note"/>}
    <div className="flex gap-2"><button type="button" disabled={starting} className="quiet-button" onClick={() => recording ? recorder.current?.stop() : void start()}>{recording ? 'Stop recording' : starting ? 'Opening microphone…' : value ? 'Record again' : 'Record audio'}</button>{value && !recording && <button type="button" className="quiet-button" onClick={() => onChange('')}>Remove audio</button>}</div>
    <p className="delivery-note">{recording ? 'Recording · stops after 60 seconds. Mission time continues.' : 'Microphone permission required · up to 60 seconds.'}</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
