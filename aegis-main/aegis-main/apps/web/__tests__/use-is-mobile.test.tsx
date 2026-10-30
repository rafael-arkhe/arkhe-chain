/**
 * Sprint L15 — useIsMobile hook.
 */
import { renderHook, act } from '@testing-library/react';
import { useIsMobile } from '@/lib/responsive/use-is-mobile';

function setWidth(w: number) {
  (window as unknown as { innerWidth: number }).innerWidth = w;
  window.dispatchEvent(new Event('resize'));
}

describe('useIsMobile', () => {
  beforeEach(() => {
    setWidth(1024); // default desktop
  });

  it('returns false on desktop width', () => {
    setWidth(1280);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('returns true on phone width', () => {
    setWidth(375);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('updates on resize', () => {
    setWidth(1280);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    act(() => setWidth(400));
    expect(result.current).toBe(true);
    act(() => setWidth(900));
    expect(result.current).toBe(false);
  });

  it('respects custom breakpoint', () => {
    setWidth(700);
    const { result } = renderHook(() => useIsMobile(768));
    expect(result.current).toBe(true);
    act(() => setWidth(800));
    expect(result.current).toBe(false);
  });
});
