export type Term = { kind: 'iri'; value: string } | { kind: 'literal'; value: string; datatype: string; language: string };
export type Draft = Record<string, Term[]>;
export type Option = { value: string; label: string };
export type Field = { id: string; path: string; label: string; description: string; group: string; order: number;
  editor: string; datatype: string | null; role: string | null; required: boolean; options: Option[]; dependsOn: string | null };
export type DemoState = {
  descriptor: { id: string; focus: string; profile: string; fields: Field[] };
  draft: Draft; baseline: Draft; catalog: Record<string, Option[]>; recordRevision: number; catalogRevision: number; saveCount: number;
  sync: 'server' | 'local'; notice: string;
  validation: null | { conforms: boolean; errors: { focus: string; sourceShape: string; path: string | null; component: string; message: string }[]; report: string };
  review: null | { id: string; before: Draft; after: Draft; recordRevision: number; catalogRevision: number };
};
