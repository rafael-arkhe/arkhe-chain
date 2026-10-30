import {
  Building2,
  Car,
  Crosshair,
  FileText,
  Gavel,
  Image,
  MapPin,
  Phone,
  ScrollText,
  Ship,
  User,
  Users,
} from 'lucide-react';
import type { ObjectType } from './mock-data';

export const OBJECT_ICONS: Record<ObjectType, typeof User> = {
  pessoa: User,
  veiculo: Car,
  telefone: Phone,
  endereco: MapPin,
  documento: FileText,
  bo: ScrollText,
  mandado: Gavel,
  processo: FileText,
  arma: Crosshair,
  evento: ScrollText,
  organizacao: Users,
  midia: Image,
};

export const OBJECT_LABELS: Record<ObjectType, string> = {
  pessoa: 'Pessoa',
  veiculo: 'Veículo',
  telefone: 'Telefone',
  endereco: 'Endereço',
  documento: 'Documento',
  bo: 'BO',
  mandado: 'Mandado',
  processo: 'Processo',
  arma: 'Arma',
  evento: 'Evento',
  organizacao: 'Organização',
  midia: 'Mídia',
};

export const _unused = { Building2, Ship };
