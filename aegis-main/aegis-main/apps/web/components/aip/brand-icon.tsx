'use client';

/**
 * BrandIcon — logo ORIGINAL da marca proprietária (OpenAI, Anthropic, Meta…),
 * inline em SVG monocromático (currentColor). Usado nos modelos que NÃO são
 * AIP Cloud: a regra é exibir o produto de terceiro com a marca real, sem
 * mascarar como AIP (risco legal). Marca derivada do prefixo do slug.
 *
 * Marcas sem logo embutido caem no fallback `null` → o card usa um ícone lucide
 * neutro + o nome da marca (que já vem no título via display_name).
 */
import * as React from 'react';

type BrandPath = { label: string; viewBox?: string; d: string };

const BRANDS: { test: RegExp; brand: BrandPath }[] = [
  {
    test: /^openai\//,
    brand: {
      label: 'OpenAI',
      d: 'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z',
    },
  },
  {
    test: /^anthropic\//,
    brand: {
      label: 'Anthropic',
      d: 'M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.541Zm-.3712 10.0875 2.2914-5.9479 2.2914 5.9479Z',
    },
  },
  {
    test: /^meta-llama\//,
    brand: {
      label: 'Meta',
      d: 'M6.897 4.035c-1.989 0-3.572 1.491-4.997 3.392C.082 9.991 0 12.692 0 13.682c0 1.746.677 3.31 2.063 3.31 1.36 0 2.187-1.078 3.392-2.804.86-1.232 1.733-2.713 2.337-3.95.118.197.24.405.367.62l1.158 1.96c1.146 1.94 1.79 2.999 2.66 4.16.93 1.243 1.737 1.733 2.804 1.733 1.41 0 2.187-1.51 2.187-3.314 0-1.067-.1-2.622-.853-4.806-.78-2.26-2.13-4.51-2.99-5.553-1.06-1.286-2.043-1.735-3.135-1.735-1.05 0-2.06.66-2.93 1.694-.74-.99-1.524-1.694-2.41-1.694zm.106 2.05c.48 0 .92.39 1.55 1.236-.7 1.066-1.5 2.45-2.18 3.62-.86 1.49-1.41 2.36-1.96 2.36-.36 0-.55-.44-.55-1.13 0-1.05.42-2.66 1.04-3.86.6-1.17 1.2-2.226 2.06-2.226zm9.876.026c.61 0 1.16.55 1.79 1.626.62 1.066 1.13 2.56 1.13 4.166 0 .69-.19 1.13-.55 1.13-.49 0-.79-.41-1.55-1.7l-1.13-1.93c-.45-.766-.9-1.5-1.32-2.18.7-1.05 1.18-1.13 1.63-1.13z',
    },
  },
];

export function BrandIcon({
  modelId,
  className,
}: {
  modelId: string;
  className?: string;
}) {
  const hit = BRANDS.find((b) => b.test.test(modelId));
  if (!hit) return null;
  return (
    <svg
      viewBox={hit.brand.viewBox ?? '0 0 24 24'}
      className={className}
      fill="currentColor"
      role="img"
      aria-label={hit.brand.label}
      data-testid={`brand-icon-${hit.brand.label.toLowerCase()}`}
    >
      <path d={hit.brand.d} />
    </svg>
  );
}

/** True se há logo de marca embutido para este modelo (proprietário conhecido). */
export function hasBrandIcon(modelId: string): boolean {
  return BRANDS.some((b) => b.test.test(modelId));
}
