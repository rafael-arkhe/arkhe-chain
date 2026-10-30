'use client';

/**
 * ConstrutorCamadasApp — a rota de aplicação do Construtor de Camadas.
 *
 * O Construtor é uma FERRAMENTA DO TENANT (como Conversas, Agentes e
 * Soluções), não um app de Operação: as camadas que ele publica são do tenant
 * inteiro. Por isso ele entra no menu pelo mesmo mecanismo daquelas — uma
 * Página registrada (``mode: app_route`` + ``experience_kind``), com perm
 * própria — e não pela seção "Meus Apps", que lista apps de Operação.
 *
 * Aqui o corpo é só a mesa de desenho: o widget ``layer_builder``. Renderizar
 * o widget direto (em vez de resolver o WorkshopApp por id) mantém UMA fonte
 * de verdade do layout — o seed cria o app para quem quiser abri-lo/editá-lo
 * pelo Workshop, e esta rota não depende do uuid dele.
 */
import * as React from 'react';
import dynamic from 'next/dynamic';

import { registerAppRoute } from '@/lib/pages/app-route-registry';

// Carrega sob demanda: o módulo do widget REGISTRA widgets ao ser importado
// (efeito colateral), e puxá-lo no import da página de views arrastava todo o
// catálogo pra dentro dessa rota (e pros testes dela).
const LayerBuilder = dynamic(
  () => import('../workshop/widgets/layer-builder').then((m) => m.LayerBuilder),
  { ssr: false },
);

/** Slug canônico da Página registrada (espelha o seed do backend). */
export const CONSTRUTOR_CAMADAS_SLUG = 'construtor-camadas';

export function ConstrutorCamadasApp() {
  return (
    <div className="h-full min-h-0" data-testid="construtor-camadas-app">
      <LayerBuilder
        appId={CONSTRUTOR_CAMADAS_SLUG}
        config={{ height: 720, view: 'streets' }}
        variables={{}}
        bindings={{}}
        setBinding={() => {}}
      />
    </div>
  );
}

registerAppRoute(CONSTRUTOR_CAMADAS_SLUG, ConstrutorCamadasApp);

export default ConstrutorCamadasApp;
