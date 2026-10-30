import { TestBed } from '@angular/core/testing';
import { CustomBenchmarkModal } from './custom-benchmark-modal';

describe('Custom melody input', () => {
  it('preserves flats and rejects malformed, oversized and out-of-range sequences', () => {
    const fixture = TestBed.createComponent(CustomBenchmarkModal);
    const component = fixture.componentInstance;
    component.notesInputA.set('Bb4 Db4');
    component.notesInputB.set('70 61');
    component.applyCustom();
    expect(component.error()).toBe('');
    expect(component.pipeline.activeTargetA().notes.map(note => note.pitch)).toEqual([70, 61]);
    const previous = component.pipeline.activeTargetA();
    for (const invalid of ['nonsense C4', '128 60', 'C4', Array(129).fill('C4').join(' ')]) {
      component.notesInputA.set(invalid);
      component.applyCustom();
      expect(component.error()).not.toBe('');
      expect(component.pipeline.activeTargetA()).toBe(previous);
    }
  });
});
