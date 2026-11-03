// The test knowledge base as a file: "<n>. <question>" followed by "Resposta: <answer>".
// Self-contained so it runs unchanged in the Edge Function (Deno) and in the Node scripts.

export type KbItem = {item: number; question: string; answer: string};

/** Converts the file into items; anything off-format throws, so a broken file never reaches the database. */
export function parseKb(text: string): KbItem[] {
  const items: KbItem[] = [];
  let open: {item: number; question: string} | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const answer = /^Resposta:\s*(.+)$/.exec(line);
    if (answer) {
      if (!open) throw new Error('invalid_kb: answer without a question');
      items.push({...open, answer: answer[1]});
      open = null;
      continue;
    }
    const question = /^(\d+)\.\s+(.+)$/.exec(line);
    if (!question) throw new Error(`invalid_kb: unexpected line after ${items.at(-1)?.item ?? 'the start'}`);
    if (open) throw new Error(`invalid_kb: item ${open.item} has no answer`);
    const item = Number(question[1]);
    if (items.some(existing => existing.item === item)) throw new Error(`invalid_kb: item ${item} is repeated`);
    open = {item, question: question[2]};
  }
  if (open) throw new Error(`invalid_kb: item ${open.item} has no answer`);
  if (!items.length) throw new Error('invalid_kb: no items');
  return items;
}
