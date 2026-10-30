'use client';

/**
 * useDeviceLocation — capability HORIZONTAL: consumir a localização do
 * dispositivo POR CONSENTIMENTO (2026-05-25).
 *
 * Genérico/multi-domínio: qualquer superfície que precise da posição do device
 * (link de visitante, app de campo, rastreio de ativo) usa este hook. Não sabe
 * o que é "condomínio" — só pede permissão, ativa alta precisão e emite cada
 * fix via callback. O consumidor decide o que fazer (ingerir, plotar, alertar).
 */
import * as React from 'react';

export interface DeviceFix {
  lat: number;
  lng: number;
  accuracy?: number;
  ts: string;
}

export interface UseDeviceLocation {
  sharing: boolean;
  position: DeviceFix | null;
  error: string | null;
  start: () => void;
  stop: () => void;
}

export function useDeviceLocation(onFix?: (fix: DeviceFix) => void): UseDeviceLocation {
  const [sharing, setSharing] = React.useState(false);
  const [position, setPosition] = React.useState<DeviceFix | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const watchRef = React.useRef<number | null>(null);
  const onFixRef = React.useRef(onFix);
  onFixRef.current = onFix;

  const stop = React.useCallback(() => {
    if (watchRef.current != null && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchRef.current);
    }
    watchRef.current = null;
    setSharing(false);
  }, []);

  const start = React.useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setError('Localização não suportada neste dispositivo.');
      return;
    }
    setError(null);
    setSharing(true);
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => {
        const fix: DeviceFix = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: typeof p.coords.accuracy === 'number' ? p.coords.accuracy : undefined,
          ts: new Date().toISOString(),
        };
        setPosition(fix);
        onFixRef.current?.(fix);
      },
      (e) => setError(
        e.code === e.PERMISSION_DENIED
          ? 'Permissão de localização negada.'
          : 'Não foi possível obter sua localização.',
      ),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
  }, []);

  React.useEffect(() => stop, [stop]);

  return { sharing, position, error, start, stop };
}
