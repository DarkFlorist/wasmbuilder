import { describe, it } from 'micro-should';
import { deepStrictEqual } from 'node:assert';
import ModuleBuilder from '../index.js';

function buf2hex(buffer) { // buffer is an ArrayBuffer
    return Array.prototype.map.call(new Uint8Array(buffer), x => ("00" + x.toString(16)).slice(-2)).join("");
}

describe("Basic tests for WasmGenerator", () => {
    it("Should generate a basic module", () => {
        const module = new ModuleBuilder();

        const bytes = module.build();

        deepStrictEqual("0061736d01000000010100020f0103656e76066d656d6f72790200010301000701000a01000b0a010041000b0408000000",buf2hex(bytes) );
    });
});
it.runWhen(import.meta.url);
