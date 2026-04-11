import { describe, expect, it } from 'vitest';
import { extractExportsFromIndex, extractImportsFromSource } from './imports.js';

describe('extractImportsFromSource', () => {
  it('categorizes @spartan-ng imports', () => {
    const source = `import { HlmButtonDirective } from '@spartan-ng/helm/button';`;
    const result = extractImportsFromSource(source);
    expect(result.spartan).toEqual(['HlmButtonDirective']);
    expect(result.angular).toEqual([]);
    expect(result.cdk).toEqual([]);
    expect(result.other).toEqual([]);
  });

  it('categorizes @angular imports', () => {
    const source = `import { Component, inject } from '@angular/core';`;
    const result = extractImportsFromSource(source);
    expect(result.angular).toEqual(['Component', 'inject']);
  });

  it('categorizes @angular/cdk imports', () => {
    const source = `import { OverlayModule } from '@angular/cdk/overlay';`;
    const result = extractImportsFromSource(source);
    expect(result.cdk).toEqual(['OverlayModule']);
  });

  it('categorizes third-party imports as other', () => {
    const source = `import { lucideIcon } from 'ng-icon';`;
    const result = extractImportsFromSource(source);
    expect(result.other).toEqual(['lucideIcon']);
  });

  it('ignores relative imports', () => {
    const source = `import { MyComponent } from './my-component';`;
    const result = extractImportsFromSource(source);
    expect(result.spartan).toEqual([]);
    expect(result.angular).toEqual([]);
    expect(result.cdk).toEqual([]);
    expect(result.other).toEqual([]);
  });

  it('handles aliased imports', () => {
    const source = `import { Component as Comp } from '@angular/core';`;
    const result = extractImportsFromSource(source);
    expect(result.angular).toEqual(['Component']);
  });

  it('handles multiple imports from same source', () => {
    const source = `import { A, B, C } from '@spartan-ng/brain/dialog';`;
    const result = extractImportsFromSource(source);
    expect(result.spartan).toEqual(['A', 'B', 'C']);
  });

  it('deduplicates imports', () => {
    const source = `
      import { A } from '@spartan-ng/brain/dialog';
      import { A } from '@spartan-ng/brain/button';
    `;
    const result = extractImportsFromSource(source);
    expect(result.spartan).toEqual(['A']);
  });

  it('sorts results alphabetically', () => {
    const source = `import { Zebra, Alpha, Middle } from '@angular/core';`;
    const result = extractImportsFromSource(source);
    expect(result.angular).toEqual(['Alpha', 'Middle', 'Zebra']);
  });

  it('handles empty source', () => {
    const result = extractImportsFromSource('');
    expect(result).toEqual({ spartan: [], angular: [], cdk: [], other: [] });
  });

  it('handles mixed imports', () => {
    const source = `
      import { Component } from '@angular/core';
      import { HlmBtn } from '@spartan-ng/helm/button';
      import { CdkDialog } from '@angular/cdk/dialog';
      import { lucide } from 'ng-icon';
      import { helper } from './utils';
    `;
    const result = extractImportsFromSource(source);
    expect(result.angular).toEqual(['Component']);
    expect(result.spartan).toEqual(['HlmBtn']);
    expect(result.cdk).toEqual(['CdkDialog']);
    expect(result.other).toEqual(['lucide']);
  });
});

describe('extractExportsFromIndex', () => {
  it('extracts re-exports', () => {
    const content = `export * from './lib/something';`;
    const result = extractExportsFromIndex(content);
    expect(result).toContain('./lib/something');
  });

  it('extracts named exports', () => {
    const content = `export { MyComponent, MyDirective } from './lib/my';`;
    const result = extractExportsFromIndex(content);
    expect(result).toContain('MyComponent');
    expect(result).toContain('MyDirective');
  });

  it('extracts const/function/class/type/interface/enum exports', () => {
    const content = `
      export const MY_CONST = 1;
      export function myFunc() {}
      export class MyClass {}
      export type MyType = string;
      export interface MyInterface {}
      export enum MyEnum {}
    `;
    const result = extractExportsFromIndex(content);
    expect(result).toContain('MY_CONST');
    expect(result).toContain('myFunc');
    expect(result).toContain('MyClass');
    expect(result).toContain('MyType');
    expect(result).toContain('MyInterface');
    expect(result).toContain('MyEnum');
  });

  it('handles aliased named exports', () => {
    const content = `export { Original as Alias } from './lib';`;
    const result = extractExportsFromIndex(content);
    expect(result).toContain('Original');
  });

  it('returns empty array for no exports', () => {
    expect(extractExportsFromIndex('const x = 1;')).toEqual([]);
  });
});
