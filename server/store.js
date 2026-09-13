import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { freshState, stateSchema } from './core.js';

export function createStore(directory = resolve('.local')) {
  mkdirSync(directory, { recursive: true });
  const stateFile = join(directory, 'state.json'), questionFile = join(directory, 'questions.json');
  let notice = '';
  const read = (file, initial, schema) => {
    if (!existsSync(file)) return initial;
    try { const value = JSON.parse(readFileSync(file, 'utf8')); return schema ? schema.parse(value) : value; }
    catch {
      const preserved = `${file}.corrupt-${Date.now()}.json`;
      renameSync(file, preserved);
      notice = `检测到损坏的本地数据，原文件已保留为 ${preserved}，应用已使用安全的空白状态启动。`;
      return initial;
    }
  };
  let state = read(stateFile, freshState(), stateSchema);
  if (!state.contentStateVersion) state = stateSchema.parse(state);
  if (existsSync(stateFile) && !JSON.parse(readFileSync(stateFile, 'utf8')).contentStateVersion) {
    copyFileSync(stateFile, `${stateFile}.before-scenes-${Date.now()}.json`);
    writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
  }
  for (const session of Object.values(state.conversations)) for (const turn of session.turns) if (['generating', 'verifying'].includes(turn.status)) { turn.status = 'failed'; turn.error = '服务已重新启动，可重试这条消息。'; }
  let generated = read(questionFile, [], zArray);
  const write = (file, data) => { writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2), { mode: 0o600 }); renameSync(`${file}.tmp`, file); };
  return {
    get state() { return state; }, get generated() { return generated; }, get notice() { return notice; },
    clearNotice() { notice = ''; },
    mutate(fn) { const draft = structuredClone(state); fn(draft); draft.revision++; write(stateFile, draft); state = draft; return state; },
    add(question) { const next = [...generated, question]; write(questionFile, next); generated = next; },
    replace(nextState, nextGenerated) { nextState = structuredClone(nextState); nextState.revision = state.revision + 1; write(stateFile, nextState); write(questionFile, nextGenerated); state = nextState; generated = structuredClone(nextGenerated); notice = ''; },
    recover(reason) {
      const suffix = `.corrupt-${Date.now()}.json`;
      if (existsSync(stateFile)) renameSync(stateFile, `${stateFile}${suffix}`);
      if (existsSync(questionFile)) renameSync(questionFile, `${questionFile}${suffix}`);
      const next = freshState(); next.revision = (state?.revision || 0) + 1;
      write(stateFile, next); write(questionFile, []); state = next; generated = []; notice = reason;
    },
    reset() { const next = freshState(); next.revision = state.revision + 1; write(stateFile, next); write(questionFile, []); state = next; generated = []; },
  };
}

const zArray = { parse(value) { if (!Array.isArray(value)) throw new Error('题库格式不正确'); return value; } };
