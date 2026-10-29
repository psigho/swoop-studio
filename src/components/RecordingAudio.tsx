import { useCallback, useEffect, useState } from "react";

export type MicrophoneChannel = "all" | "left" | "right";

export default function RecordingAudio({
  enabled,
  deviceId,
  channel,
  onDevice,
  onChannel,
  systemEnabled,
  outputDeviceId,
  onOutputDevice,
}: {
  enabled: boolean;
  deviceId: string;
  channel: MicrophoneChannel;
  onDevice: (id: string) => void;
  onChannel: (channel: MicrophoneChannel) => void;
  systemEnabled: boolean;
  outputDeviceId: string;
  onOutputDevice: (id: string) => void;
}) {
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<
    { id: string; name: string; isDefault: boolean }[]
  >([]);
  const [outputError, setOutputError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    setInputs(devices.filter((device) => device.kind === "audioinput"));
    if (window.swoop)
      try {
        setOutputs(await window.swoop.getSystemOutputs());
        setOutputError("");
      } catch (error) {
        setOutputError(`Could not list system outputs: ${String(error)}`);
      }
  }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(enabled);
    setError("");
    void (async () => {
      try {
        // Device names may be hidden until access is granted. Release this
        // short-lived stream immediately; the recorder opens the chosen input.
        if (enabled) {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
          stream.getTracks().forEach((track) => track.stop());
        }
        if (!cancelled) await refresh();
      } catch (error) {
        if (!cancelled)
          setError(
            `Microphone access failed. ${error instanceof Error ? error.message : String(error)} Choose a working input or turn Microphone off.`,
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const changed = () => {
      void refresh().catch(() => {});
    };
    navigator.mediaDevices?.addEventListener("devicechange", changed);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener("devicechange", changed);
    };
  }, [enabled, refresh]);
  const missing =
    enabled &&
    deviceId !== "default" &&
    !inputs.some((input) => input.deviceId === deviceId);
  return (
    <div className="record-audio-devices">
      {enabled && (
        <>
          <label>
            Microphone input
            <select
              aria-label="Microphone input"
              value={deviceId}
              onChange={(event) => onDevice(event.target.value)}
              disabled={loading}
            >
              <option value="default">Windows default microphone</option>
              {missing && (
                <option value={deviceId}>
                  Previously selected microphone — disconnected
                </option>
              )}
              {inputs
                .filter(
                  (input) =>
                    input.deviceId !== "default" &&
                    input.deviceId !== "communications",
                )
                .map((input, index) => (
                  <option key={input.deviceId} value={input.deviceId}>
                    {input.label || `Microphone ${index + 1}`}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Microphone channel
            <select
              aria-label="Microphone channel"
              value={channel}
              onChange={(event) =>
                onChannel(event.target.value as MicrophoneChannel)
              }
            >
              <option value="all">All channels / mono microphone</option>
              <option value="left">Left channel → both ears</option>
              <option value="right">Right channel → both ears</option>
            </select>
          </label>
          <p className="audio-source-note">
            {loading
              ? "Finding your microphones…"
              : "The chosen microphone is mixed with system sound in your video. Left or right puts that input in both ears."}
          </p>
          {(error || missing) && (
            <p role="alert" className="audio-device-error">
              {error ||
                "The selected microphone is disconnected. Choose another input before recording."}
            </p>
          )}
        </>
      )}
      {window.swoop && systemEnabled && (
        <div className="system-audio-source">
          <label>
            System sound output
            <select
              aria-label="System sound output"
              value={outputDeviceId}
              onChange={(e) => onOutputDevice(e.target.value)}
            >
              <option value="default">
                Windows default
                {outputs.find((o) => o.isDefault)
                  ? ` · ${outputs.find((o) => o.isDefault)!.name}`
                  : ""}
              </option>
              {outputDeviceId !== "default" &&
                !outputs.some((o) => o.id === outputDeviceId) && (
                  <option value={outputDeviceId}>
                    Selected output — disconnected
                  </option>
                )}
              {outputs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <small>
              Records sound playing through this device. Your Windows default
              stays unchanged.
            </small>
            {outputError && <small role="alert">{outputError}</small>}
          </label>
          <button
            className="button"
            type="button"
            onClick={() =>
              void refresh().catch((error) => setOutputError(String(error)))
            }
          >
            Refresh devices
          </button>
        </div>
      )}
    </div>
  );
}
