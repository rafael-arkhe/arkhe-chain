/**
 * Tipo da câmera pelas TAGS (a mesma convenção dos badges do /cameras:
 * `bc-ready` = contagem, `ocr` = documento, `face`/`facial`, `lpr-ready`).
 *
 * É o que equilibra a toolbar: câmera de contagem não caça placa, câmera de
 * OCR não mostra hotlist — cada gesto aparece só onde faz sentido, SEM
 * depender do operador lembrar de qual botão serve para quê.
 */
import type { CCTVStream } from '@/lib/api/cctv';

export type CameraKind = 'con' | 'ocr' | 'face' | 'lpr' | 'generic';

export function cameraKindOf(s: CCTVStream | null | undefined): CameraKind {
  if (!s) return 'generic';
  const tags = s.tags ?? [];
  if (tags.includes('bc-ready') || tags.includes('contagem-sacos')) return 'con';
  if (tags.includes('ocr')) return 'ocr';
  if (tags.includes('face') || tags.includes('facial')) return 'face';
  if (s.detection_enabled || tags.includes('lpr-ready')) return 'lpr';
  return 'generic';
}

export interface CameraCapabilities {
  /** Hotlist LPR ("Placas procuradas") — só câmera de placas. */
  hotlist: boolean;
  /** Análise multidomínio (inferência em nuvem). */
  multidominio: boolean;
  /** Calibração GCP pixel↔mapa ("Calibrar posição"). */
  gcp: boolean;
  /** Calibração de linha/ROI da contagem ("Calibrar linha") — só CON. */
  linha: boolean;
}

export function capabilitiesOf(kind: CameraKind): CameraCapabilities {
  switch (kind) {
    case 'con':
      // Contagem: a linha é desenhada no frame (o serviço aplica); nuvem
      // externa e hotlist de placa não são gestos deste vertical.
      return { hotlist: false, multidominio: false, gcp: false, linha: true };
    case 'ocr':
      return { hotlist: false, multidominio: true, gcp: true, linha: false };
    case 'face':
      return { hotlist: false, multidominio: true, gcp: true, linha: false };
    case 'lpr':
    case 'generic':
    default:
      return { hotlist: true, multidominio: true, gcp: true, linha: false };
  }
}
