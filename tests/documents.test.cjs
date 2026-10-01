const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
const source = ts.transpileModule(fs.readFileSync('src/features/documents/service.ts','utf8'), {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
vm.runInNewContext(source,{exports:exportsObject,require:()=>({}),Uint8Array,Error});
const {detectDocumentType,MAX_FILE_BYTES,documentError} = exportsObject;
const bytes = list => new Uint8Array(list).buffer;
test('recognizes allowed signatures independently of filename',()=>{
  assert.equal(detectDocumentType(bytes([37,80,68,70,45])),'application/pdf');
  assert.equal(detectDocumentType(bytes([137,80,78,71,13,10,26,10])),'image/png');
  assert.equal(detectDocumentType(bytes([255,216,255])),'image/jpeg');
});
test('rejects empty, oversized, truncated and unrecognized content',()=>{
  for(const buffer of [new ArrayBuffer(0),new ArrayBuffer(MAX_FILE_BYTES+1),bytes([137,80]),bytes([60,104,116,109,108])]) {
    assert.throws(()=>detectDocumentType(buffer));
  }
});
test('does not display raw backend details',()=>{
  assert.doesNotMatch(documentError({code:'XX000',message:'internal secret'}),/secret/);
  assert.match(documentError({code:'23505'}),/já está compartilhado/);
});
